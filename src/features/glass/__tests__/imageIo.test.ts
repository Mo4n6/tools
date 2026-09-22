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
});
