import { describe, expect, it } from 'vitest';

import {
  MAX_OUTPUT_PIXELS,
  OUTPUT_BUDGET_BYTES,
  OUTPUT_BYTES_PER_PIXEL,
  blendTileInto,
  createOutput,
  edgeRamp,
  outputBytes,
  planTiles,
} from '../tiling';
import type { RgbaImage } from '../types';

function solidPatch(width: number, height: number, rgba: readonly number[]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set(rgba, i * 4);
  return { width, height, data };
}

describe('planTiles', () => {
  it('covers every source pixel exactly once', () => {
    const width = 37;
    const height = 23;
    const coverage = new Uint8Array(width * height);

    for (const tile of planTiles(width, height, 16, 4)) {
      for (let y = tile.y; y < tile.y + tile.height; y += 1) {
        for (let x = tile.x; x < tile.x + tile.width; x += 1) {
          coverage[y * width + x] += 1;
        }
      }
    }

    expect([...coverage].every((count) => count === 1)).toBe(true);
  });

  it('keeps padding inside the image and around the core', () => {
    for (const tile of planTiles(37, 23, 16, 4)) {
      expect(tile.padX).toBeGreaterThanOrEqual(0);
      expect(tile.padY).toBeGreaterThanOrEqual(0);
      expect(tile.padX).toBeLessThanOrEqual(tile.x);
      expect(tile.padY).toBeLessThanOrEqual(tile.y);
      expect(tile.padX + tile.padWidth).toBeLessThanOrEqual(37);
      expect(tile.padY + tile.padHeight).toBeLessThanOrEqual(23);
      expect(tile.padX + tile.padWidth).toBeGreaterThanOrEqual(tile.x + tile.width);
      expect(tile.padY + tile.padHeight).toBeGreaterThanOrEqual(tile.y + tile.height);
    }
  });

  it('returns a single tile when the image fits', () => {
    const tiles = planTiles(10, 10, 64, 8);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ x: 0, y: 0, width: 10, height: 10, padWidth: 10, padHeight: 10 });
  });

  it('handles an empty image and rejects nonsense parameters', () => {
    expect(planTiles(0, 10, 16, 4)).toEqual([]);
    expect(() => planTiles(10, 10, 0, 4)).toThrow(RangeError);
    expect(() => planTiles(10, 10, 16, -1)).toThrow(RangeError);
  });
});

describe('edgeRamp', () => {
  it('ramps up monotonically and reaches one', () => {
    expect(edgeRamp(0, 0)).toBe(1);
    expect(edgeRamp(8, 8)).toBe(1);
    expect(edgeRamp(0, 8)).toBeLessThan(edgeRamp(4, 8));
    expect(edgeRamp(4, 8)).toBeLessThan(edgeRamp(7, 8));
  });

  it('never reaches zero', () => {
    expect(edgeRamp(0, 64)).toBeGreaterThan(0);
  });
});

describe('output budget', () => {
  it('holds one RGBA quad per pixel, not a float accumulator', () => {
    expect(OUTPUT_BYTES_PER_PIXEL).toBe(4);
    expect(outputBytes(1000, 1000)).toBe(4_000_000);
    expect(MAX_OUTPUT_PIXELS).toBe(Math.floor(OUTPUT_BUDGET_BYTES / OUTPUT_BYTES_PER_PIXEL));
  });

  it('admits a print-resolution job', () => {
    // 3136x4672 through a 2x model: 58.6 megapixels. This needed 1.1 GB as a
    // float accumulator and was refused; as an image it is 234 MB.
    expect(() => createOutput(6272, 9344)).not.toThrow();
    expect(outputBytes(6272, 9344)).toBeLessThan(OUTPUT_BUDGET_BYTES);
  });

  it('still refuses a size it could not encode afterwards', () => {
    expect(() => createOutput(MAX_OUTPUT_PIXELS + 1, 1)).toThrow(RangeError);
    expect(() => createOutput(MAX_OUTPUT_PIXELS + 1, 1)).toThrow(/smaller source image or a model with a lower factor/);
  });

  it('rejects a degenerate size', () => {
    expect(() => createOutput(0, 10)).toThrow(RangeError);
  });
});

describe('tile composition', () => {
  const colour = [12, 180, 90, 255] as const;

  function composeConstant(width: number, height: number, tileSize: number, overlap: number, scale: number) {
    const output = createOutput(width * scale, height * scale);
    for (const tile of planTiles(width, height, tileSize, overlap)) {
      blendTileInto(output, solidPatch(tile.padWidth * scale, tile.padHeight * scale, colour), tile, scale);
    }
    return output;
  }

  it('reconstructs a constant colour across every seam', () => {
    const out = composeConstant(40, 24, 16, 4, 2);
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(colour[0]);
      expect(out.data[i + 1]).toBe(colour[1]);
      expect(out.data[i + 2]).toBe(colour[2]);
      expect(out.data[i + 3]).toBe(colour[3]);
    }
  });

  it('leaves no pixel unwritten, at any tiling', () => {
    for (const [tileSize, overlap] of [
      [16, 4],
      [8, 0],
      [7, 3],
      [64, 16],
    ] as const) {
      const out = composeConstant(37, 23, tileSize, overlap, 3);
      const unwritten = [...out.data].filter((_, i) => i % 4 === 3 && out.data[i] === 0).length;
      expect(unwritten, `tileSize ${tileSize} overlap ${overlap}`).toBe(0);
    }
  });

  it('fades a differing tile in rather than cutting to it', () => {
    // Two tiles of very different colours: the boundary must be a gradient,
    // not a step, or the seam would be visible on a real image.
    const scale = 1;
    const tiles = planTiles(32, 8, 16, 8);
    const output = createOutput(32, 8);

    blendTileInto(output, solidPatch(tiles[0]!.padWidth, tiles[0]!.padHeight, [0, 0, 0, 255]), tiles[0]!, scale);
    blendTileInto(output, solidPatch(tiles[1]!.padWidth, tiles[1]!.padHeight, [255, 255, 255, 255]), tiles[1]!, scale);

    const row = (x: number) => output.data[(0 * output.width + x) * 4] ?? 0;
    expect(row(0)).toBe(0);
    expect(row(31)).toBe(255);

    // Somewhere in the band the two are mixed rather than one replacing the other.
    const mixed = Array.from({ length: 32 }, (_, x) => row(x)).filter((v) => v > 0 && v < 255);
    expect(mixed.length).toBeGreaterThan(0);
  });

  it('writes a single tile with no fade at all', () => {
    const [tile] = planTiles(10, 10, 64, 8);
    const output = createOutput(20, 20);
    blendTileInto(output, solidPatch(20, 20, colour), tile!, 2);
    for (let i = 0; i < output.data.length; i += 4) {
      expect(output.data[i]).toBe(colour[0]);
    }
  });
});
