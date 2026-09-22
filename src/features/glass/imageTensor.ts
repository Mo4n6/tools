// Conversion between RGBA pixels and the NCHW float tensors ESRGAN-family
// models expect.
//
// These models are trained on three channels. Rather than drop alpha or feed
// the network a composited background it never saw in training, the colour
// channels go through the model and the alpha channel is resampled separately
// and reattached. A transparent PNG therefore stays transparent, and the model
// is never asked a question it was not trained to answer.

import type { RgbaImage } from './types';

/** Packs RGB into `[1, 3, height, width]` float32 in the 0..1 range. */
export function toNchw(image: RgbaImage): Float32Array {
  const { width, height, data } = image;
  const plane = width * height;
  const tensor = new Float32Array(plane * 3);

  for (let i = 0; i < plane; i += 1) {
    const p = i * 4;
    tensor[i] = (data[p] ?? 0) / 255;
    tensor[plane + i] = (data[p + 1] ?? 0) / 255;
    tensor[plane * 2 + i] = (data[p + 2] ?? 0) / 255;
  }

  return tensor;
}

/**
 * Unpacks `[1, 3, height, width]` float32 back to opaque RGBA.
 *
 * Values are clamped: a generative model routinely pushes a highlight past 1.0,
 * and letting that wrap around would put black specks in bright areas.
 */
export function fromNchw(tensor: Float32Array, width: number, height: number): RgbaImage {
  const plane = width * height;
  if (tensor.length < plane * 3) {
    throw new RangeError(`Tensor holds ${tensor.length} values, need ${plane * 3}`);
  }

  const data = new Uint8ClampedArray(plane * 4);
  for (let i = 0; i < plane; i += 1) {
    const p = i * 4;
    data[p] = (tensor[i] ?? 0) * 255;
    data[p + 1] = (tensor[plane + i] ?? 0) * 255;
    data[p + 2] = (tensor[plane * 2 + i] ?? 0) * 255;
    data[p + 3] = 255;
  }

  return { width, height, data };
}

/** Extracts alpha as a single-channel image so it can be scaled on its own. */
export function extractAlpha(image: RgbaImage): RgbaImage {
  const plane = image.width * image.height;
  const data = new Uint8ClampedArray(plane * 4);

  for (let i = 0; i < plane; i += 1) {
    const value = image.data[i * 4 + 3] ?? 0;
    const p = i * 4;
    data[p] = value;
    data[p + 1] = value;
    data[p + 2] = value;
    data[p + 3] = 255;
  }

  return { width: image.width, height: image.height, data };
}

/** True when nothing in the image is even slightly transparent. */
export function isFullyOpaque(image: RgbaImage): boolean {
  for (let i = 3; i < image.data.length; i += 4) {
    if (image.data[i] !== 255) return false;
  }
  return true;
}

/**
 * Writes a separately scaled alpha channel back onto colour pixels.
 *
 * The two must already agree on size; they are produced from the same source
 * dimensions by the same scale factor, so a mismatch is a bug rather than a
 * condition to paper over.
 */
export function applyAlpha(colour: RgbaImage, alpha: RgbaImage): RgbaImage {
  if (colour.width !== alpha.width || colour.height !== alpha.height) {
    throw new RangeError(
      `Alpha is ${alpha.width}x${alpha.height} but colour is ${colour.width}x${colour.height}`,
    );
  }

  const data = new Uint8ClampedArray(colour.data);
  for (let i = 0; i < colour.width * colour.height; i += 1) {
    data[i * 4 + 3] = alpha.data[i * 4] ?? 255;
  }

  return { width: colour.width, height: colour.height, data };
}
