// The tier registry, and dispatch for the two tiers that need no model.
//
// Glass does not pick a tier for the operator. The three do genuinely different
// things — one reconstructs, one preserves, one invents — and which is correct
// depends on what the image is, which is a question only the person looking at
// it can answer. So the registry exists to describe the trade honestly and let
// them choose, not to rank them.

import { upscaleLanczos } from './lanczos';
import { isPixelScale, upscalePixel } from './pixel';
import type { RgbaImage, TierDescriptor, TierId } from './types';

/** Tiers that run from source alone, with no weights to fetch. */
export type LocalTierId = Extract<TierId, 'lanczos' | 'pixel'>;

export const TIERS: readonly TierDescriptor[] = [
  {
    id: 'lanczos',
    label: 'Lanczos',
    summary: 'Windowed-sinc resampling. Reconstructs the signal the pixels encode.',
    bestFor: 'Photographs that are already sharp and just need to be larger.',
    runsOn: 'CPU, in a worker. Instant.',
    download: 'None.',
    scales: [2, 3, 4],
  },
  {
    id: 'pixel',
    label: 'Pixel',
    summary: 'Scale2x edge extension. Copies pixels, never blends them.',
    bestFor: 'Sprites, screenshots, logos, line art — anything with hard edges.',
    runsOn: 'CPU, in a worker. Instant.',
    download: 'None.',
    scales: [2, 4, 8],
  },
  {
    id: 'neural',
    label: 'Neural',
    summary: 'A convolutional super-resolution model, tiled and run locally.',
    bestFor: 'Soft or small photographs where plausible detail beats no detail.',
    runsOn: 'WebGPU where available, single-threaded WASM otherwise.',
    download: 'The .onnx weights you supply, cached after the first load.',
    // Empty because the factor is a property of the model, not a setting.
    scales: [],
  },
];

export function tierById(id: TierId): TierDescriptor {
  const tier = TIERS.find((candidate) => candidate.id === id);
  if (!tier) throw new RangeError(`Unknown tier "${id}"`);
  return tier;
}

/** Whether a tier can produce a given factor. */
export function supportsScale(id: TierId, scale: number): boolean {
  if (id === 'pixel') return isPixelScale(scale) && scale <= 8;
  if (id === 'lanczos') return scale > 1 && scale <= 8;
  // The neural tier's factor comes back from the model, so nothing to check.
  return true;
}

/**
 * Runs a tier that needs no model.
 *
 * Kept synchronous and DOM-free so it can run in a worker and be tested without
 * a browser.
 */
export function upscaleLocal(source: RgbaImage, tier: LocalTierId, scale: number): RgbaImage {
  if (!supportsScale(tier, scale)) {
    throw new RangeError(`${tierById(tier).label} cannot produce ${scale}x`);
  }
  return tier === 'pixel' ? upscalePixel(source, scale) : upscaleLanczos(source, scale);
}

/** Output pixel count, for warning before a browser tries to allocate it. */
export function outputPixels(width: number, height: number, scale: number): number {
  return Math.round(width * scale) * Math.round(height * scale);
}

/** Roughly where a browser canvas starts refusing to allocate. */
export const CANVAS_PIXEL_CEILING = 268_435_456;
