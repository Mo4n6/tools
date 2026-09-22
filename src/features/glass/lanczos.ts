// Separable Lanczos resampling.
//
// This is the tier that promises nothing it cannot deliver: it reconstructs the
// band-limited signal the source pixels already encode and stops there. No
// detail is invented, so nothing is hallucinated either.
//
// Alpha is premultiplied before filtering and divided back out afterwards.
// Filtering straight RGBA would let the colour of fully transparent pixels leak
// into the visible edge as a dark or white halo.

import type { RgbaImage } from './types';

/** Default kernel lobe count. Three lobes is the usual sharpness/ringing trade. */
export const DEFAULT_LOBES = 3;

/**
 * The Lanczos kernel: a sinc windowed by a wider sinc.
 *
 * Zero at every non-zero integer, which is what makes an unscaled resample an
 * identity rather than a slow blur.
 */
export function lanczos(x: number, lobes: number = DEFAULT_LOBES): number {
  if (x === 0) return 1;
  if (Math.abs(x) >= lobes) return 0;
  const pix = Math.PI * x;
  return (lobes * Math.sin(pix) * Math.sin(pix / lobes)) / (pix * pix);
}

/**
 * Per-output-pixel tap positions and weights for one axis.
 *
 * Taps are stored in a flat array of fixed stride so the inner loop reads
 * contiguous memory; rows shorter than the stride are zero-padded, and a zero
 * weight contributes nothing.
 */
export interface AxisWeights {
  /** First source index sampled by each destination pixel. */
  readonly starts: Int32Array;
  /** `destSize * stride` weights, normalised so each row sums to 1. */
  readonly weights: Float32Array;
  readonly stride: number;
}

export function buildAxisWeights(
  srcSize: number,
  destSize: number,
  lobes: number = DEFAULT_LOBES,
): AxisWeights {
  if (srcSize <= 0 || destSize <= 0) {
    throw new RangeError('Lanczos axis sizes must be positive');
  }

  const scale = destSize / srcSize;
  // Downscaling has to widen the kernel in source space, otherwise the filter
  // samples between the input pixels it is meant to be averaging and aliases.
  const filterScale = scale < 1 ? 1 / scale : 1;
  const support = lobes * filterScale;
  const stride = Math.ceil(support * 2) + 2;

  const starts = new Int32Array(destSize);
  const weights = new Float32Array(destSize * stride);

  for (let i = 0; i < destSize; i += 1) {
    // Pixel centres, not corners: the half-pixel offset is what keeps the image
    // from drifting by half an output pixel at every scale change.
    const center = (i + 0.5) / scale;
    const first = Math.max(0, Math.floor(center - support + 0.5));
    const last = Math.min(srcSize - 1, Math.ceil(center + support - 0.5));

    starts[i] = first;
    const base = i * stride;
    let sum = 0;

    for (let j = first; j <= last && j - first < stride; j += 1) {
      const weight = lanczos((j + 0.5 - center) / filterScale, lobes);
      weights[base + (j - first)] = weight;
      sum += weight;
    }

    // Renormalise. Clipping the kernel at the border leaves the row summing to
    // less than one, which would darken every edge of the image.
    if (sum !== 0) {
      for (let k = 0; k < stride; k += 1) {
        weights[base + k] /= sum;
      }
    } else {
      // Degenerate only if every tap fell outside the source; nearest is the
      // honest fallback.
      weights[base] = 1;
    }
  }

  return { starts, weights, stride };
}

/** Resamples to an exact destination size. */
export function resample(
  source: RgbaImage,
  destWidth: number,
  destHeight: number,
  lobes: number = DEFAULT_LOBES,
): RgbaImage {
  if (destWidth <= 0 || destHeight <= 0) {
    throw new RangeError('Lanczos destination size must be positive');
  }

  const { width: srcWidth, height: srcHeight, data: src } = source;
  const horizontal = buildAxisWeights(srcWidth, destWidth, lobes);
  const vertical = buildAxisWeights(srcHeight, destHeight, lobes);

  // Horizontal pass into a float buffer of destWidth x srcHeight, premultiplied.
  const intermediate = new Float32Array(destWidth * srcHeight * 4);
  for (let y = 0; y < srcHeight; y += 1) {
    const srcRow = y * srcWidth * 4;
    const dstRow = y * destWidth * 4;
    for (let x = 0; x < destWidth; x += 1) {
      const start = horizontal.starts[x] ?? 0;
      const base = x * horizontal.stride;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let k = 0; k < horizontal.stride; k += 1) {
        const weight = horizontal.weights[base + k] ?? 0;
        if (weight === 0) continue;
        const sx = start + k;
        if (sx >= srcWidth) break;
        const p = srcRow + sx * 4;
        const alpha = (src[p + 3] ?? 0) / 255;
        r += (src[p] ?? 0) * alpha * weight;
        g += (src[p + 1] ?? 0) * alpha * weight;
        b += (src[p + 2] ?? 0) * alpha * weight;
        a += alpha * weight;
      }

      const q = dstRow + x * 4;
      intermediate[q] = r;
      intermediate[q + 1] = g;
      intermediate[q + 2] = b;
      intermediate[q + 3] = a;
    }
  }

  // Vertical pass, unpremultiplying on the way out.
  const out = new Uint8ClampedArray(destWidth * destHeight * 4);
  for (let y = 0; y < destHeight; y += 1) {
    const start = vertical.starts[y] ?? 0;
    const base = y * vertical.stride;
    const dstRow = y * destWidth * 4;

    for (let x = 0; x < destWidth; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let k = 0; k < vertical.stride; k += 1) {
        const weight = vertical.weights[base + k] ?? 0;
        if (weight === 0) continue;
        const sy = start + k;
        if (sy >= srcHeight) break;
        const p = (sy * destWidth + x) * 4;
        r += (intermediate[p] ?? 0) * weight;
        g += (intermediate[p + 1] ?? 0) * weight;
        b += (intermediate[p + 2] ?? 0) * weight;
        a += (intermediate[p + 3] ?? 0) * weight;
      }

      const q = dstRow + x * 4;
      // Lanczos overshoots by design; clamp alpha before dividing so a tiny
      // negative value cannot turn into a huge colour.
      const alpha = Math.min(1, Math.max(0, a));
      if (alpha > 0) {
        out[q] = r / alpha;
        out[q + 1] = g / alpha;
        out[q + 2] = b / alpha;
      }
      out[q + 3] = alpha * 255;
    }
  }

  return { width: destWidth, height: destHeight, data: out };
}

/** Resamples by a factor, rounding to whole pixels. */
export function upscaleLanczos(
  source: RgbaImage,
  scale: number,
  lobes: number = DEFAULT_LOBES,
): RgbaImage {
  if (!(scale > 0)) throw new RangeError('Scale must be positive');
  return resample(
    source,
    Math.max(1, Math.round(source.width * scale)),
    Math.max(1, Math.round(source.height * scale)),
    lobes,
  );
}
