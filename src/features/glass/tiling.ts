// Tile planning and seam blending for the neural tier.
//
// A convolutional super-resolution network holds its whole activation stack in
// memory at once, so feeding it a 12-megapixel photo asks for several gigabytes
// and gets an out-of-memory abort instead. Tiling trades that for many small
// runs, and the cost of tiling is seams: each tile is denoised independently
// and the edges do not agree.
//
// Both halves of the fix live here. Tiles are planned with padding that gives
// the model context it will not keep, and each tile is then written into the
// result with a raised-cosine fade across the band it shares with the
// neighbours already placed, so the two cross-fade rather than butt together.

import type { RgbaImage } from './types';

export interface Tile {
  /** The region of the source this tile alone is responsible for. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The region actually fed to the model: the above, grown by the overlap and
   *  clamped to the image. Context the model sees but that is blended away. */
  readonly padX: number;
  readonly padY: number;
  readonly padWidth: number;
  readonly padHeight: number;
}

/**
 * Splits an image into tiles whose core regions cover it exactly once.
 *
 * `overlap` is context, not stride: adjacent cores still meet edge to edge, and
 * the padding only widens what each run is allowed to look at.
 */
export function planTiles(
  width: number,
  height: number,
  tileSize: number,
  overlap: number,
): Tile[] {
  if (width <= 0 || height <= 0) return [];
  if (tileSize <= 0) throw new RangeError('Tile size must be positive');
  if (overlap < 0) throw new RangeError('Overlap cannot be negative');

  const tiles: Tile[] = [];

  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const coreWidth = Math.min(tileSize, width - x);
      const coreHeight = Math.min(tileSize, height - y);
      const padX = Math.max(0, x - overlap);
      const padY = Math.max(0, y - overlap);
      const padRight = Math.min(width, x + coreWidth + overlap);
      const padBottom = Math.min(height, y + coreHeight + overlap);

      tiles.push({
        x,
        y,
        width: coreWidth,
        height: coreHeight,
        padX,
        padY,
        padWidth: padRight - padX,
        padHeight: padBottom - padY,
      });
    }
  }

  return tiles;
}

/**
 * A raised-cosine ramp over `ramp` pixels, reaching 1 at the inner end.
 *
 * Never returns exactly 0: a tile that contributes zero weight everywhere along
 * an axis would leave the accumulator empty if it were the only tile covering
 * a pixel, and the division at the end would produce nothing.
 */
export function edgeRamp(distance: number, ramp: number): number {
  if (ramp <= 0) return 1;
  const t = Math.min(1, (distance + 0.5) / ramp);
  return Math.max(1e-4, 0.5 - 0.5 * Math.cos(Math.PI * t));
}

/**
 * Bytes the finished image holds per pixel: one RGBA quad.
 *
 * It was five times this until tiles were composed directly into the result.
 * The earlier design accumulated four float32 colour sums and a float32 weight
 * per pixel and divided at the end, which is the textbook way to blend
 * overlapping contributions — and which put a 1.1 GB allocation behind a
 * perfectly ordinary print-resolution job.
 *
 * It is unnecessary here because tiles are not written in arbitrary order.
 * They go left to right, top to bottom, so when a tile reaches back into its
 * neighbours it is reaching into pixels that are already final. One blend
 * against those is enough; nothing needs accumulating, and nothing needs
 * dividing.
 */
export const OUTPUT_BYTES_PER_PIXEL = 4;

/**
 * What one result is allowed to claim.
 *
 * One gibibyte of image, about 268 megapixels. The number is not a guess; it
 * is bounded from two directions that were measured rather than assumed.
 *
 * Above, by allocation. A Uint8ClampedArray of 1.9 GB still allocates in a
 * current Chromium and 2.0 GB does not — it throws "Array buffer allocation
 * failed" outright. Anything at or past that cliff cannot be produced at all,
 * whatever the budget says, so a larger number here would only move a clear
 * refusal into an opaque crash.
 *
 * Below, by the encode. putImageData hands the canvas its own copy, so a
 * result at this budget peaks near 2 GB before a PNG exists — which is
 * verified to work, and which is also why the budget is half the cliff rather
 * than just under it.
 *
 * Raising it further means taking the canvas out of the encode path, not
 * changing this constant: CompressionStream can deflate a PNG directly from
 * these bytes, which removes the copy and the browser's own canvas limits with
 * it.
 */
export const OUTPUT_BUDGET_BYTES = 1_073_741_824;

export const MAX_OUTPUT_PIXELS = Math.floor(OUTPUT_BUDGET_BYTES / OUTPUT_BYTES_PER_PIXEL);

/** Bytes an output of this size would hold. */
export function outputBytes(width: number, height: number): number {
  return width * height * OUTPUT_BYTES_PER_PIXEL;
}

/** Allocates the result, refusing a size that cannot be composed or encoded. */
export function createOutput(width: number, height: number): RgbaImage {
  if (width <= 0 || height <= 0) throw new RangeError('Output size must be positive');

  if (width * height > MAX_OUTPUT_PIXELS) {
    throw new RangeError(
      `An output of ${width}x${height} needs ${(outputBytes(width, height) / 1024 ** 3).toFixed(1)} GB, ` +
        `past the ${(OUTPUT_BUDGET_BYTES / 1024 ** 3).toFixed(1)} GB budget. ` +
        `Use a smaller source image or a model with a lower factor.`,
    );
  }

  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/**
 * Writes one tile's output into the result, fading into what is already there.
 *
 * Each tile owns its core region outright and additionally reaches back over
 * the neighbours to its left and above, cross-fading across that band so the
 * seam between two independently denoised tiles does not show. It never
 * reaches right or down, because nothing has been written there yet — those
 * neighbours will reach back into this tile when their turn comes.
 */
export function blendTileInto(
  target: RgbaImage,
  patch: RgbaImage,
  tile: Tile,
  scale: number,
): void {
  const coreX0 = Math.round(tile.x * scale);
  const coreY0 = Math.round(tile.y * scale);
  const coreX1 = Math.min(target.width, Math.round((tile.x + tile.width) * scale));
  const coreY1 = Math.min(target.height, Math.round((tile.y + tile.height) * scale));

  const patchX0 = Math.round(tile.padX * scale);
  const patchY0 = Math.round(tile.padY * scale);

  // How far back this tile may reach: no further than the context it was
  // actually given, and never past its own core.
  const leftBand = Math.max(0, Math.min(coreX0 - patchX0, coreX1 - coreX0));
  const topBand = Math.max(0, Math.min(coreY0 - patchY0, coreY1 - coreY0));

  const startX = Math.max(0, coreX0 - leftBand);
  const startY = Math.max(0, coreY0 - topBand);

  for (let y = startY; y < coreY1; y += 1) {
    const patchY = y - patchY0;
    if (patchY < 0 || patchY >= patch.height) continue;
    const verticalFade = y >= coreY0 || topBand <= 0 ? 1 : edgeRamp(y - (coreY0 - topBand), topBand);

    for (let x = startX; x < coreX1; x += 1) {
      const patchX = x - patchX0;
      if (patchX < 0 || patchX >= patch.width) continue;

      const horizontalFade =
        x >= coreX0 || leftBand <= 0 ? 1 : edgeRamp(x - (coreX0 - leftBand), leftBand);
      const weight = horizontalFade * verticalFade;

      const source = (patchY * patch.width + patchX) * 4;
      const destination = (y * target.width + x) * 4;

      if (weight >= 1) {
        target.data[destination] = patch.data[source] ?? 0;
        target.data[destination + 1] = patch.data[source + 1] ?? 0;
        target.data[destination + 2] = patch.data[source + 2] ?? 0;
        target.data[destination + 3] = patch.data[source + 3] ?? 0;
        continue;
      }

      const keep = 1 - weight;
      for (let channel = 0; channel < 4; channel += 1) {
        target.data[destination + channel] =
          (target.data[destination + channel] ?? 0) * keep + (patch.data[source + channel] ?? 0) * weight;
      }
    }
  }
}
