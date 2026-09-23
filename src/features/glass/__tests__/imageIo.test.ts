import { describe, expect, it } from 'vitest';

import { outputFileName } from '../imageIo';

describe('outputFileName', () => {
  it('keeps the stem and records the factor', () => {
    expect(outputFileName('holding-field.jpg', 4)).toBe('holding-field@4x.png');
  });

  it('strips only the final extension', () => {
    expect(outputFileName('scan.2024.tiff', 2)).toBe('scan.2024@2x.png');
  });

  it('copes with a name that is only an extension', () => {
    expect(outputFileName('.png', 2)).toBe('image@2x.png');
  });

  it('copes with no extension at all', () => {
    expect(outputFileName('sprite', 8)).toBe('sprite@8x.png');
  });

  it('names the physical size when one was chosen', () => {
    expect(outputFileName('logo.png', { widthInches: 11, heightInches: 14 })).toBe('logo@11x14in.png');
  });

  it('trims a fractional size rather than spelling out the float', () => {
    expect(outputFileName('logo.png', { widthInches: 3.5, heightInches: 4.25 })).toBe('logo@3.5x4.25in.png');
    expect(outputFileName('logo.png', { widthInches: 8.0, heightInches: 10.0 })).toBe('logo@8x10in.png');
  });
});
