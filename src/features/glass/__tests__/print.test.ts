import { describe, expect, it } from 'vitest';

import {
  DTF_PRESETS,
  assessPrint,
  describeQuality,
  effectiveDpi,
  fitToPrint,
  placeOnTarget,
  targetPixels,
  type PrintTarget,
} from '../print';
import type { RgbaImage } from '../types';

const ADULT: PrintTarget = { widthInches: 11, heightInches: 14, dpi: 300 };

function solid(width: number, height: number, rgba: readonly number[]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set(rgba, i * 4);
  return { width, height, data };
}

describe('targetPixels', () => {
  it('turns inches and density into pixels', () => {
    expect(targetPixels(ADULT)).toEqual({ width: 3300, height: 4200 });
    expect(targetPixels({ ...ADULT, dpi: 600 })).toEqual({ width: 6600, height: 8400 });
  });

  it('never rounds away to nothing', () => {
    expect(targetPixels({ widthInches: 0.001, heightInches: 0.001, dpi: 72 }).width).toBe(1);
  });
});

describe('placeOnTarget', () => {
  it('fits the whole design inside, centred', () => {
    // 6272x9344 into 3300x4200: height is the tighter axis.
    const placed = placeOnTarget({ width: 6272, height: 9344 }, ADULT, 'fit');
    expect(placed.height).toBe(4200);
    expect(placed.width).toBeLessThanOrEqual(3300);
    expect(placed.offsetX).toBeGreaterThanOrEqual(0);
    expect(placed.offsetY).toBe(0);
  });

  it('covers the target when told to fill, overflowing rather than padding', () => {
    const placed = placeOnTarget({ width: 6272, height: 9344 }, ADULT, 'fill');
    expect(placed.width).toBeGreaterThanOrEqual(3300);
    expect(placed.height).toBeGreaterThanOrEqual(4200);
    expect(placed.offsetX).toBeLessThanOrEqual(0);
  });

  it('leaves a matching aspect ratio untouched by either mode', () => {
    const square: PrintTarget = { widthInches: 4, heightInches: 4, dpi: 300 };
    const fit = placeOnTarget({ width: 600, height: 600 }, square, 'fit');
    const fill = placeOnTarget({ width: 600, height: 600 }, square, 'fill');
    expect(fit).toEqual(fill);
    expect(fit).toMatchObject({ width: 1200, height: 1200, offsetX: 0, offsetY: 0 });
  });
});

describe('density reporting', () => {
  it('measures pixels against inches', () => {
    expect(effectiveDpi(3300, 11)).toBe(300);
    expect(effectiveDpi(1650, 11)).toBe(150);
    expect(effectiveDpi(100, 0)).toBe(0);
  });

  it('puts words to a number nobody reads', () => {
    expect(describeQuality(600)).toBe('ample');
    expect(describeQuality(300)).toBe('ample');
    expect(describeQuality(250)).toBe('good');
    expect(describeQuality(160)).toBe('marginal');
    expect(describeQuality(90)).toBe('thin');
  });

  it('reports against the axis that runs out first', () => {
    // Plenty for a pocket print, nowhere near enough for a gang sheet.
    const source = { width: 1200, height: 1200 };
    expect(assessPrint(source, { widthInches: 4, heightInches: 4, dpi: 300 }, 'fit').quality).toBe('ample');
    expect(assessPrint(source, { widthInches: 22, heightInches: 36, dpi: 300 }, 'fit').quality).toBe('thin');
  });
});

describe('fitToPrint', () => {
  const colour = [40, 200, 120, 255] as const;

  it('produces exactly the target pixel size', () => {
    const out = fitToPrint(solid(64, 96, colour), { widthInches: 2, heightInches: 3, dpi: 100 }, 'fit');
    expect(out.width).toBe(200);
    expect(out.height).toBe(300);
    expect(out.data.length).toBe(200 * 300 * 4);
  });

  it('pads with transparency, not white, so no ink is printed there', () => {
    // A wide source into a square target leaves bands above and below.
    const out = fitToPrint(solid(200, 50, colour), { widthInches: 1, heightInches: 1, dpi: 200 }, 'fit');
    const at = (x: number, y: number) => out.data[(y * out.width + x) * 4 + 3];
    expect(at(100, 0)).toBe(0);
    expect(at(100, out.height - 1)).toBe(0);
    expect(at(100, Math.floor(out.height / 2))).toBe(255);
  });

  it('keeps the design intact rather than stretching it', () => {
    const out = fitToPrint(solid(200, 50, colour), { widthInches: 1, heightInches: 1, dpi: 200 }, 'fit');
    const middle = Math.floor(out.height / 2) * out.width * 4 + Math.floor(out.width / 2) * 4;
    expect(out.data[middle]).toBe(colour[0]);
    expect(out.data[middle + 1]).toBe(colour[1]);
    expect(out.data[middle + 2]).toBe(colour[2]);
  });

  it('fills the target edge to edge when told to fill', () => {
    const out = fitToPrint(solid(200, 50, colour), { widthInches: 1, heightInches: 1, dpi: 200 }, 'fill');
    for (const [x, y] of [[0, 0], [out.width - 1, 0], [0, out.height - 1], [out.width - 1, out.height - 1]] as const) {
      expect(out.data[(y * out.width + x) * 4 + 3], `corner ${x},${y}`).toBe(255);
    }
  });
});

describe('print target budget', () => {
  it('refuses a size that multiplies out past what can be held', () => {
    // 22x36 inches at 600 DPI is 285 megapixels — larger than the upscaler
    // itself is allowed to produce.
    expect(() => fitToPrint(solid(8, 8, [0, 0, 0, 255]), { widthInches: 22, heightInches: 36, dpi: 600 }, 'fit'))
      .toThrow(/Use a lower density or a smaller size/);
  });

  it('allows the same sheet at the usual density', () => {
    expect(targetPixels({ widthInches: 22, heightInches: 36, dpi: 300 })).toEqual({ width: 6600, height: 10800 });
  });
});

describe('the presets that ship', () => {
  it('are all usable sizes with unique ids', () => {
    const ids = DTF_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of DTF_PRESETS) {
      expect(preset.widthInches).toBeGreaterThan(0);
      expect(preset.heightInches).toBeGreaterThan(0);
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it('keep gang sheets to the film roll width', () => {
    for (const preset of DTF_PRESETS.filter((p) => p.id.startsWith('gang'))) {
      expect(preset.widthInches).toBe(22);
    }
  });
});
