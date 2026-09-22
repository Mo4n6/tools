// Scale2x (AdvMAME2x) — edge-directed integer upscaling.
//
// Interpolation is the wrong tool for sprites, screenshots, logos and line art:
// those images are not samples of a continuous signal, so reconstructing one
// just smears the hard edges that carry the meaning. Scale2x instead reads the
// four orthogonal neighbours and extends a diagonal only where one demonstrably
// continues, leaving every other output pixel an exact copy of its source.
//
// The consequence worth knowing: no new colours are ever produced. The output
// palette is exactly the input palette.

import type { RgbaImage } from './types';

/** Scale factors reachable by repeated doubling. */
export const PIXEL_SCALES = [2, 4, 8] as const;

/**
 * Packs RGBA into one comparable integer per pixel.
 *
 * Fully transparent pixels collapse to a single value: two invisible pixels
 * carrying different colour bytes are the same pixel to a viewer, and treating
 * them as an edge would fabricate one.
 */
export function packPixels(image: RgbaImage): Uint32Array {
  const count = image.width * image.height;
  const packed = new Uint32Array(count);
  const data = image.data;

  for (let i = 0; i < count; i += 1) {
    const p = i * 4;
    const alpha = data[p + 3] ?? 0;
    if (alpha === 0) continue;
    packed[i] =
      (((data[p] ?? 0) << 24) |
        ((data[p + 1] ?? 0) << 16) |
        ((data[p + 2] ?? 0) << 8) |
        alpha) >>>
      0;
  }

  return packed;
}

export function unpackPixels(packed: Uint32Array, width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < packed.length; i += 1) {
    const value = packed[i] ?? 0;
    const p = i * 4;
    data[p] = (value >>> 24) & 0xff;
    data[p + 1] = (value >>> 16) & 0xff;
    data[p + 2] = (value >>> 8) & 0xff;
    data[p + 3] = value & 0xff;
  }

  return { width, height, data };
}

/**
 * One Scale2x doubling over packed pixels.
 *
 * For source pixel P with orthogonal neighbours A (above), B (right),
 * C (left) and D (below), the four output pixels are P unless a diagonal edge
 * runs through the corner, in which case the neighbour on that diagonal wins.
 * Borders replicate, so the rule sees a defined neighbour everywhere.
 */
export function scale2xPacked(
  source: Uint32Array,
  width: number,
  height: number,
): Uint32Array {
  const destWidth = width * 2;
  const out = new Uint32Array(destWidth * height * 2);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const rowAbove = y > 0 ? row - width : row;
    const rowBelow = y < height - 1 ? row + width : row;

    for (let x = 0; x < width; x += 1) {
      const p = source[row + x] ?? 0;
      const a = source[rowAbove + x] ?? 0;
      const d = source[rowBelow + x] ?? 0;
      const c = source[row + (x > 0 ? x - 1 : x)] ?? 0;
      const b = source[row + (x < width - 1 ? x + 1 : x)] ?? 0;

      const e0 = c === a && c !== d && a !== b ? a : p;
      const e1 = a === b && a !== c && b !== d ? b : p;
      const e2 = d === c && d !== b && c !== a ? c : p;
      const e3 = b === d && b !== a && d !== c ? d : p;

      const top = y * 2 * destWidth + x * 2;
      const bottom = top + destWidth;
      out[top] = e0;
      out[top + 1] = e1;
      out[bottom] = e2;
      out[bottom + 1] = e3;
    }
  }

  return out;
}

/** True for the integer powers of two this tier can reach. */
export function isPixelScale(scale: number): boolean {
  return Number.isInteger(scale) && scale >= 2 && (scale & (scale - 1)) === 0;
}

/** Applies Scale2x repeatedly to reach 2x, 4x or 8x. */
export function upscalePixel(source: RgbaImage, scale: number): RgbaImage {
  if (!isPixelScale(scale)) {
    throw new RangeError(`Pixel tier needs a power-of-two scale, got ${scale}`);
  }

  let packed = packPixels(source);
  let width = source.width;
  let height = source.height;

  for (let factor = scale; factor > 1; factor /= 2) {
    packed = scale2xPacked(packed, width, height);
    width *= 2;
    height *= 2;
  }

  return unpackPixels(packed, width, height);
}
