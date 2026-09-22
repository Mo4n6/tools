import { describe, expect, it } from 'vitest';

import { TIERS, outputPixels, supportsScale, tierById, upscaleLocal } from '../pipeline';
import type { RgbaImage } from '../types';

function flat(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set([10, 20, 30, 255], i * 4);
  return { width, height, data };
}

describe('tier registry', () => {
  it('describes every tier exactly once', () => {
    expect(TIERS.map((tier) => tier.id)).toEqual(['lanczos', 'pixel', 'neural']);
    expect(new Set(TIERS.map((tier) => tier.label)).size).toBe(TIERS.length);
  });

  it('offers only scales the tier can actually produce', () => {
    for (const tier of TIERS) {
      for (const scale of tier.scales) {
        expect(supportsScale(tier.id, scale)).toBe(true);
      }
    }
  });

  it('leaves the neural factor to the model rather than advertising one', () => {
    expect(tierById('neural').scales).toEqual([]);
  });

  it('rejects an unknown tier', () => {
    expect(() => tierById('sharpen' as 'lanczos')).toThrow(RangeError);
  });
});

describe('supportsScale', () => {
  it('holds the pixel tier to powers of two', () => {
    expect(supportsScale('pixel', 4)).toBe(true);
    expect(supportsScale('pixel', 3)).toBe(false);
    expect(supportsScale('pixel', 16)).toBe(false);
  });

  it('lets Lanczos take any factor above one', () => {
    expect(supportsScale('lanczos', 1.5)).toBe(true);
    expect(supportsScale('lanczos', 1)).toBe(false);
    expect(supportsScale('lanczos', 9)).toBe(false);
  });
});

describe('upscaleLocal', () => {
  it('dispatches to the tier that was asked for', () => {
    expect(upscaleLocal(flat(4, 4), 'lanczos', 3).width).toBe(12);
    expect(upscaleLocal(flat(4, 4), 'pixel', 2).width).toBe(8);
  });

  it('refuses a factor the tier cannot produce', () => {
    expect(() => upscaleLocal(flat(4, 4), 'pixel', 3)).toThrow(RangeError);
  });
});

describe('outputPixels', () => {
  it('counts the pixels a result would need', () => {
    expect(outputPixels(1920, 1080, 4)).toBe(7680 * 4320);
  });
});
