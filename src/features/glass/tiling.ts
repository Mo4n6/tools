// Tile planning and seam blending for the neural tier.
//
// A convolutional super-resolution network holds its whole activation stack in
// memory at once, so feeding it a 12-megapixel photo asks for several gigabytes
// and gets an out-of-memory abort instead. Tiling trades that for many small
// runs, and the cost of tiling is seams: each tile is denoised independently
// and the edges do not agree.
//
// Both halves of the fix live here. Tiles are planned with padding that is
// thrown away, and what remains is accumulated through a raised-cosine window
// so neighbouring tiles cross-fade rather than butt against each other.

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
 * Blend weights along one axis of a tile.
 *
 * Only the sides that were actually padded are ramped. A side clamped against
 * the image border has no neighbour to blend with, and fading it would darken
 * the outer edge of the result.
 */
export function axisWindow(
  length: number,
  ramp: number,
  rampStart: boolean,
  rampEnd: boolean,
): Float32Array {
  const window = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const fromStart = rampStart ? edgeRamp(i, ramp) : 1;
    const fromEnd = rampEnd ? edgeRamp(length - 1 - i, ramp) : 1;
    window[i] = Math.min(fromStart, fromEnd);
  }

  return window;
}

/**
 * Bytes the accumulator holds per output pixel: four float32 colour sums plus
 * one float32 weight.
 *
 * Tiling bounds what the model holds at once, but not this. The accumulator is
 * full-size by construction, and at 20 bytes a pixel it outgrows the tab long
 * before the tiles do: a 12-megapixel photo through a 4x model wants 192
 * megapixels of accumulator, which is 3.8 GB.
 */
export const CANVAS_BYTES_PER_PIXEL = 20;

/**
 * What the accumulator is allowed to claim.
 *
 * One gibibyte is already beyond generous for a browser tab; the point is to
 * fail immediately with a number the operator can act on, rather than to get
 * an opaque allocation error or take the tab down with it.
 */
export const CANVAS_BUDGET_BYTES = 1_073_741_824;

export const MAX_CANVAS_PIXELS = Math.floor(CANVAS_BUDGET_BYTES / CANVAS_BYTES_PER_PIXEL);

/** Bytes the accumulator for an output of this size would hold. */
export function canvasBytes(width: number, height: number): number {
  return width * height * CANVAS_BYTES_PER_PIXEL;
}

/** Accumulates weighted tile outputs before the final divide. */
export interface Canvas {
  readonly width: number;
  readonly height: number;
  /** Premultiplied RGBA sums, 4 per pixel. */
  readonly colour: Float32Array;
  /** Summed weight per pixel. */
  readonly weight: Float32Array;
}

export function createCanvas(width: number, height: number): Canvas {
  const pixels = width * height;
  if (pixels > MAX_CANVAS_PIXELS) {
    throw new RangeError(
      `An output of ${width}x${height} needs ${(canvasBytes(width, height) / 1024 ** 3).toFixed(1)} GB ` +
        `to compose, past the ${(CANVAS_BUDGET_BYTES / 1024 ** 3).toFixed(0)} GB budget. ` +
        `Use a smaller source image or a model with a lower factor.`,
    );
  }

  return {
    width,
    height,
    colour: new Float32Array(width * height * 4),
    weight: new Float32Array(width * height),
  };
}

/**
 * Adds one upscaled tile to the canvas.
 *
 * `patch` is the model output for the tile's padded region, already at output
 * scale; it is placed at the padded origin times the scale.
 */
export function accumulateTile(
  canvas: Canvas,
  patch: RgbaImage,
  tile: Tile,
  scale: number,
): void {
  const ramp = Math.max(1, Math.round(Math.min(tile.padWidth, tile.padHeight) * scale * 0.25));
  const windowX = axisWindow(
    patch.width,
    ramp,
    tile.padX < tile.x,
    tile.padX + tile.padWidth > tile.x + tile.width,
  );
  const windowY = axisWindow(
    patch.height,
    ramp,
    tile.padY < tile.y,
    tile.padY + tile.padHeight > tile.y + tile.height,
  );

  const originX = Math.round(tile.padX * scale);
  const originY = Math.round(tile.padY * scale);

  for (let y = 0; y < patch.height; y += 1) {
    const targetY = originY + y;
    if (targetY < 0 || targetY >= canvas.height) continue;
    const wy = windowY[y] ?? 0;

    for (let x = 0; x < patch.width; x += 1) {
      const targetX = originX + x;
      if (targetX < 0 || targetX >= canvas.width) continue;

      const weight = wy * (windowX[x] ?? 0);
      const source = (y * patch.width + x) * 4;
      const index = targetY * canvas.width + targetX;
      const target = index * 4;
      const alpha = (patch.data[source + 3] ?? 0) / 255;

      canvas.colour[target] += (patch.data[source] ?? 0) * alpha * weight;
      canvas.colour[target + 1] += (patch.data[source + 1] ?? 0) * alpha * weight;
      canvas.colour[target + 2] += (patch.data[source + 2] ?? 0) * alpha * weight;
      canvas.colour[target + 3] += alpha * weight;
      canvas.weight[index] += weight;
    }
  }
}

/** Divides out the accumulated weight and returns straight RGBA. */
export function resolveCanvas(canvas: Canvas): RgbaImage {
  const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);

  for (let i = 0; i < canvas.weight.length; i += 1) {
    const weight = canvas.weight[i] ?? 0;
    const p = i * 4;
    if (weight <= 0) continue;

    const alpha = (canvas.colour[p + 3] ?? 0) / weight;
    if (alpha > 0) {
      data[p] = (canvas.colour[p] ?? 0) / weight / alpha;
      data[p + 1] = (canvas.colour[p + 1] ?? 0) / weight / alpha;
      data[p + 2] = (canvas.colour[p + 2] ?? 0) / weight / alpha;
    }
    data[p + 3] = alpha * 255;
  }

  return { width: canvas.width, height: canvas.height, data };
}
