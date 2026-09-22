import { describe, expect, it } from 'vitest';

import { applyAlpha, extractAlpha, fromNchw, isFullyOpaque, toNchw } from '../imageTensor';
import type { RgbaImage } from '../types';

function image(width: number, height: number, bytes: readonly number[]): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(bytes) };
}

describe('NCHW conversion', () => {
  it('round-trips opaque colour', () => {
    const source = image(2, 1, [255, 128, 0, 255, 10, 20, 30, 255]);
    const restored = fromNchw(toNchw(source), 2, 1);
    expect([...restored.data]).toEqual([...source.data]);
  });

  it('lays channels out plane by plane', () => {
    const tensor = toNchw(image(2, 1, [255, 0, 0, 255, 0, 255, 0, 255]));
    // Red plane, then green, then blue.
    expect([...tensor]).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('clamps model overshoot instead of wrapping it', () => {
    const out = fromNchw(Float32Array.from([1.4, -0.3, 0.5]), 1, 1);
    expect([...out.data]).toEqual([255, 0, 128, 255]);
  });

  it('rejects a tensor too small for the claimed size', () => {
    expect(() => fromNchw(new Float32Array(5), 2, 1)).toThrow(RangeError);
  });
});

describe('alpha handling', () => {
  it('detects transparency', () => {
    expect(isFullyOpaque(image(1, 2, [0, 0, 0, 255, 0, 0, 0, 255]))).toBe(true);
    expect(isFullyOpaque(image(1, 2, [0, 0, 0, 255, 0, 0, 0, 254]))).toBe(false);
  });

  it('round-trips a channel through extract and apply', () => {
    const source = image(2, 1, [9, 9, 9, 40, 9, 9, 9, 200]);
    const restored = applyAlpha(source, extractAlpha(source));
    expect([...restored.data]).toEqual([...source.data]);
  });

  it('refuses a mismatched alpha channel', () => {
    expect(() =>
      applyAlpha(image(2, 1, [0, 0, 0, 255, 0, 0, 0, 255]), image(1, 1, [0, 0, 0, 255])),
    ).toThrow(RangeError);
  });
});
