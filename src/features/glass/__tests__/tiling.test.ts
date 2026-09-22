import { describe, expect, it } from 'vitest';

import {
  accumulateTile,
  axisWindow,
  createCanvas,
  edgeRamp,
  planTiles,
  resolveCanvas,
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

describe('blend windows', () => {
  it('ramps up monotonically and reaches one', () => {
    expect(edgeRamp(0, 0)).toBe(1);
    expect(edgeRamp(8, 8)).toBe(1);
    expect(edgeRamp(0, 8)).toBeLessThan(edgeRamp(4, 8));
    expect(edgeRamp(4, 8)).toBeLessThan(edgeRamp(7, 8));
  });

  it('is flat when neither side was padded', () => {
    expect([...axisWindow(5, 2, false, false)]).toEqual([1, 1, 1, 1, 1]);
  });

  it('fades only the padded side', () => {
    const window = axisWindow(8, 3, true, false);
    expect(window[0]).toBeLessThan(1);
    expect(window[7]).toBe(1);
  });

  it('never reaches zero, so a lone tile still contributes', () => {
    for (const weight of axisWindow(8, 4, true, true)) {
      expect(weight).toBeGreaterThan(0);
    }
  });
});

describe('canvas composition', () => {
  it('reconstructs a constant colour across tile seams', () => {
    const scale = 2;
    const width = 40;
    const height = 24;
    const canvas = createCanvas(width * scale, height * scale);
    const colour = [12, 180, 90, 255] as const;

    for (const tile of planTiles(width, height, 16, 4)) {
      const patch = solidPatch(tile.padWidth * scale, tile.padHeight * scale, colour);
      accumulateTile(canvas, patch, tile, scale);
    }

    expect([...canvas.weight].every((w) => w > 0)).toBe(true);

    const out = resolveCanvas(canvas);
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(colour[0]);
      expect(out.data[i + 1]).toBe(colour[1]);
      expect(out.data[i + 2]).toBe(colour[2]);
      expect(out.data[i + 3]).toBe(colour[3]);
    }
  });

  it('leaves uncovered pixels fully transparent', () => {
    const canvas = createCanvas(4, 4);
    const out = resolveCanvas(canvas);
    expect([...out.data].every((byte) => byte === 0)).toBe(true);
  });
});
