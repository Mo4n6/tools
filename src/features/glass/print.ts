// Fitting an upscaled result to a physical size.
//
// A model enlarges by whatever factor it was trained for — two, four — and
// that factor has nothing to do with the size anyone needs to print. Upscaling
// a 3136x4672 photograph through a 4x model gives 41x62 inches at 300 DPI,
// which is not a transfer, it is a billboard. The useful question is not "how
// many times larger" but "how many inches, at what density".
//
// So the two are separated. The model invents detail; this fits the result to
// a target measured in inches, by resampling it. Fitting afterwards rather than
// instead is deliberate: running the model first and reducing second is what
// makes a print sharp, because the reduction is throwing away surplus detail
// rather than stretching a shortage of it.

import { resample } from './lanczos';
import { MAX_OUTPUT_PIXELS, outputBytes } from './tiling';
import type { RgbaImage } from './types';

/** A physical target: a size in inches and the density to render it at. */
export interface PrintTarget {
  readonly widthInches: number;
  readonly heightInches: number;
  readonly dpi: number;
}

export interface PrintPreset {
  readonly id: string;
  readonly label: string;
  readonly widthInches: number;
  readonly heightInches: number;
  readonly note: string;
}

/**
 * Common DTF transfer and gang-sheet sizes.
 *
 * A starting point rather than a standard: printers and shops differ, and the
 * width and height remain editable. The 22-inch widths are the usual film roll
 * and the reason gang sheets are shaped the way they are.
 */
export const DTF_PRESETS: readonly PrintPreset[] = [
  { id: 'pocket', label: 'Pocket / left chest', widthInches: 4, heightInches: 4, note: 'Small placement.' },
  { id: 'youth', label: 'Youth', widthInches: 8, heightInches: 10, note: 'Youth garment front.' },
  { id: 'adult', label: 'Adult front', widthInches: 11, heightInches: 14, note: 'The usual adult front.' },
  { id: 'oversize', label: 'Oversize front', widthInches: 12, heightInches: 16, note: 'Full front, larger garments.' },
  { id: 'gang-short', label: 'Gang sheet 22x24', widthInches: 22, heightInches: 24, note: 'Film-roll width.' },
  { id: 'gang-long', label: 'Gang sheet 22x36', widthInches: 22, heightInches: 36, note: 'Film-roll width, longer run.' },
];

/** Densities worth offering. 300 is the DTF default; 600 is for fine line art. */
export const DPI_CHOICES = [150, 300, 600] as const;

/** The pixel dimensions a target works out to. */
export function targetPixels(target: PrintTarget): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(target.widthInches * target.dpi)),
    height: Math.max(1, Math.round(target.heightInches * target.dpi)),
  };
}

export type FitMode = 'fit' | 'fill';

export interface Placement {
  /** Size the source is resampled to. */
  readonly width: number;
  readonly height: number;
  /** Where it sits on the target canvas; negative when `fill` crops. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Works out where the source lands on the target.
 *
 * `fit` keeps the whole design and leaves the rest transparent, which is what
 * a transfer wants: film carries ink only where there is ink, so the margin
 * costs nothing and nothing is cropped off. `fill` covers the target instead
 * and loses whatever falls outside.
 */
export function placeOnTarget(
  source: { readonly width: number; readonly height: number },
  target: PrintTarget,
  mode: FitMode,
): Placement {
  const { width: targetWidth, height: targetHeight } = targetPixels(target);
  const byWidth = targetWidth / source.width;
  const byHeight = targetHeight / source.height;
  const scale = mode === 'fill' ? Math.max(byWidth, byHeight) : Math.min(byWidth, byHeight);

  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  return {
    width,
    height,
    offsetX: Math.round((targetWidth - width) / 2),
    offsetY: Math.round((targetHeight - height) / 2),
  };
}

/**
 * The density the source actually supports at a given physical size.
 *
 * This is the number that decides whether a print looks right, and it is the
 * one nobody is shown: a result can be enormous in pixels and still be thin
 * when spread over 22 inches.
 */
export function effectiveDpi(sourcePixels: number, inches: number): number {
  if (inches <= 0) return 0;
  return sourcePixels / inches;
}

export type PrintQuality = 'ample' | 'good' | 'marginal' | 'thin';

/** Plain words for a density, since the number alone means little. */
export function describeQuality(dpi: number): PrintQuality {
  if (dpi >= 300) return 'ample';
  if (dpi >= 200) return 'good';
  if (dpi >= 150) return 'marginal';
  return 'thin';
}

/**
 * Reports what a result would give at a target, before committing to it.
 *
 * Reported against the smaller of the two axes, because that is the one that
 * runs out first and therefore the one that limits the print.
 */
export function assessPrint(
  source: { readonly width: number; readonly height: number },
  target: PrintTarget,
  mode: FitMode,
): { readonly dpi: number; readonly quality: PrintQuality; readonly placement: Placement } {
  const placement = placeOnTarget(source, target, mode);
  const dpi = Math.min(
    effectiveDpi(source.width, placement.width / target.dpi),
    effectiveDpi(source.height, placement.height / target.dpi),
  );
  return { dpi, quality: describeQuality(dpi), placement };
}

/**
 * Renders a result at exactly the target's pixel dimensions.
 *
 * Resampled with the same Lanczos filter the first tier uses, then placed on a
 * transparent canvas. Transparent rather than white on purpose: a white
 * background would be printed as white ink.
 */
export function fitToPrint(source: RgbaImage, target: PrintTarget, mode: FitMode): RgbaImage {
  const { width: targetWidth, height: targetHeight } = targetPixels(target);

  // Inches and density multiply fast: 22x36 at 600 DPI is 285 megapixels,
  // larger than anything the upscaler itself is allowed to produce. The same
  // ceiling applies, and for the same reason.
  if (targetWidth * targetHeight > MAX_OUTPUT_PIXELS) {
    throw new RangeError(
      `${target.widthInches}x${target.heightInches} inches at ${target.dpi} DPI is ` +
        `${targetWidth}x${targetHeight} pixels, needing ` +
        `${(outputBytes(targetWidth, targetHeight) / 1024 ** 3).toFixed(1)} GB. ` +
        `Use a lower density or a smaller size.`,
    );
  }

  const placement = placeOnTarget(source, target, mode);
  const scaled = resample(source, placement.width, placement.height);

  const data = new Uint8ClampedArray(targetWidth * targetHeight * 4);

  for (let y = 0; y < scaled.height; y += 1) {
    const targetY = y + placement.offsetY;
    if (targetY < 0 || targetY >= targetHeight) continue;

    // Whole rows move at once; `fill` is the only mode that clips sideways.
    const from = y * scaled.width * 4;
    const startX = Math.max(0, -placement.offsetX);
    const endX = Math.min(scaled.width, targetWidth - placement.offsetX);
    if (endX <= startX) continue;

    data.set(
      scaled.data.subarray(from + startX * 4, from + endX * 4),
      (targetY * targetWidth + placement.offsetX + startX) * 4,
    );
  }

  return { width: targetWidth, height: targetHeight, data };
}
