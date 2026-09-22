import { describe, expect, it } from 'vitest';

import { buildAxisWeights, lanczos, resample, upscaleLanczos } from '../lanczos';
import type { RgbaImage } from '../types';

function solid(width: number, height: number, rgba: readonly number[]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data.set(rgba, i * 4);
  }
  return { width, height, data };
}

describe('lanczos kernel', () => {
  it('is one at the origin', () => {
    expect(lanczos(0)).toBe(1);
  });

  it('vanishes at every other integer, which is what makes 1:1 an identity', () => {
    for (const x of [-2, -1, 1, 2]) {
      expect(Math.abs(lanczos(x))).toBeLessThan(1e-12);
    }
  });

  it('is zero outside the lobe count', () => {
    expect(lanczos(3)).toBe(0);
    expect(lanczos(4.5)).toBe(0);
    expect(lanczos(-3.2)).toBe(0);
  });

  it('is symmetric', () => {
    expect(lanczos(0.37)).toBeCloseTo(lanczos(-0.37), 12);
  });

  it('overshoots negative between lobes, as a sharpening kernel must', () => {
    expect(lanczos(1.5)).toBeLessThan(0);
  });
});

describe('buildAxisWeights', () => {
  it('normalises every row to one, including the clipped border rows', () => {
    const { weights, stride } = buildAxisWeights(7, 23);
    for (let i = 0; i < 23; i += 1) {
      let sum = 0;
      for (let k = 0; k < stride; k += 1) sum += weights[i * stride + k] ?? 0;
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('widens the kernel when downscaling so it does not alias', () => {
    const up = buildAxisWeights(10, 40);
    const down = buildAxisWeights(40, 10);
    expect(down.stride).toBeGreaterThan(up.stride);
  });

  it('never starts a row outside the source', () => {
    const { starts } = buildAxisWeights(5, 17);
    for (const start of starts) {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThan(5);
    }
  });

  it('rejects degenerate sizes', () => {
    expect(() => buildAxisWeights(0, 4)).toThrow(RangeError);
    expect(() => buildAxisWeights(4, 0)).toThrow(RangeError);
  });
});

describe('resample', () => {
  it('is an identity at 1:1', () => {
    const source: RgbaImage = {
      width: 4,
      height: 3,
      data: new Uint8ClampedArray(
        Array.from({ length: 48 }, (_, i) => (i * 37) % 256),
      ),
    };

    const out = resample(source, 4, 3);
    for (let i = 0; i < source.data.length; i += 1) {
      expect(Math.abs((out.data[i] ?? 0) - (source.data[i] ?? 0))).toBeLessThanOrEqual(1);
    }
  });

  it('preserves a constant colour rather than darkening the border', () => {
    const out = resample(solid(5, 5, [30, 200, 120, 255]), 17, 13);
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(30);
      expect(out.data[i + 1]).toBe(200);
      expect(out.data[i + 2]).toBe(120);
      expect(out.data[i + 3]).toBe(255);
    }
  });

  it('does not let transparent pixels bleed colour into the opaque edge', () => {
    // Left half opaque white, right half transparent black. Filtering straight
    // RGBA would drag the white down towards zero across the seam.
    const width = 8;
    const height = 1;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let x = 0; x < width; x += 1) {
      const p = x * 4;
      const opaque = x < 4;
      data[p] = opaque ? 255 : 0;
      data[p + 1] = opaque ? 255 : 0;
      data[p + 2] = opaque ? 255 : 0;
      data[p + 3] = opaque ? 255 : 0;
    }

    const out = resample({ width, height, data }, 32, 1);
    // Sample well inside the opaque run; it must still be white.
    const probe = 4 * 4;
    expect(out.data[probe]).toBeGreaterThan(250);
    expect(out.data[probe + 3]).toBeGreaterThan(250);
  });

  it('rejects a non-positive destination', () => {
    expect(() => resample(solid(2, 2, [0, 0, 0, 255]), 0, 4)).toThrow(RangeError);
  });
});

describe('upscaleLanczos', () => {
  it('scales both axes and rounds to whole pixels', () => {
    const out = upscaleLanczos(solid(3, 5, [1, 2, 3, 255]), 2.5);
    expect(out.width).toBe(8);
    expect(out.height).toBe(13);
    expect(out.data.length).toBe(8 * 13 * 4);
  });

  it('rejects a non-positive scale', () => {
    expect(() => upscaleLanczos(solid(2, 2, [0, 0, 0, 255]), 0)).toThrow(RangeError);
  });
});
