import { describe, expect, it } from 'vitest';

import { isPixelScale, packPixels, scale2xPacked, unpackPixels, upscalePixel } from '../pixel';
import type { RgbaImage } from '../types';

const RED = [220, 30, 30, 255] as const;
const BLUE = [30, 60, 220, 255] as const;

function fromGrid(grid: readonly (readonly number[])[][]): RgbaImage {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(grid[y]?.[x] ?? [0, 0, 0, 0], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

function pixelAt(image: RgbaImage, x: number, y: number): number[] {
  const p = (y * image.width + x) * 4;
  return [image.data[p] ?? 0, image.data[p + 1] ?? 0, image.data[p + 2] ?? 0, image.data[p + 3] ?? 0];
}

describe('packing', () => {
  it('round-trips opaque pixels exactly', () => {
    const image = fromGrid([
      [RED, BLUE],
      [BLUE, RED],
    ]);
    const restored = unpackPixels(packPixels(image), 2, 2);
    expect([...restored.data]).toEqual([...image.data]);
  });

  it('treats every fully transparent pixel as the same pixel', () => {
    const image = fromGrid([[[255, 0, 0, 0], [0, 255, 0, 0]]]);
    const packed = packPixels(image);
    expect(packed[0]).toBe(packed[1]);
  });
});

describe('scale2x', () => {
  it('extends a diagonal into the corner it continues through', () => {
    // A (above) and C (left) are red; P, B and D are blue. Only the top-left
    // sub-pixel sits on that diagonal, so only it may change.
    const image = fromGrid([
      [BLUE, RED, BLUE],
      [RED, BLUE, BLUE],
      [BLUE, BLUE, BLUE],
    ]);

    const out = unpackPixels(scale2xPacked(packPixels(image), 3, 3), 6, 6);

    expect(pixelAt(out, 2, 2)).toEqual([...RED]);
    expect(pixelAt(out, 3, 2)).toEqual([...BLUE]);
    expect(pixelAt(out, 2, 3)).toEqual([...BLUE]);
    expect(pixelAt(out, 3, 3)).toEqual([...BLUE]);
  });

  it('leaves a solid block solid', () => {
    const image = fromGrid([
      [RED, RED],
      [RED, RED],
    ]);
    const out = unpackPixels(scale2xPacked(packPixels(image), 2, 2), 4, 4);
    for (let i = 0; i < out.data.length; i += 4) {
      expect([...out.data.slice(i, i + 4)]).toEqual([...RED]);
    }
  });

  it('never invents a colour that was not in the source', () => {
    const image = fromGrid([
      [RED, BLUE, RED],
      [BLUE, RED, BLUE],
      [RED, BLUE, RED],
    ]);
    const out = upscalePixel(image, 4);
    const allowed = new Set([packPixels(image)[0], packPixels(image)[1]]);
    for (const value of packPixels(out)) {
      expect(allowed.has(value)).toBe(true);
    }
  });
});

describe('upscalePixel', () => {
  it('doubles repeatedly to reach the requested factor', () => {
    const image = fromGrid([[RED, BLUE]]);
    expect(upscalePixel(image, 2).width).toBe(4);
    expect(upscalePixel(image, 4).width).toBe(8);
    expect(upscalePixel(image, 8).height).toBe(8);
  });

  it('accepts only powers of two above one', () => {
    expect(isPixelScale(2)).toBe(true);
    expect(isPixelScale(8)).toBe(true);
    expect(isPixelScale(3)).toBe(false);
    expect(isPixelScale(1)).toBe(false);
    expect(isPixelScale(2.5)).toBe(false);
    expect(() => upscalePixel(fromGrid([[RED]]), 3)).toThrow(RangeError);
  });
});
