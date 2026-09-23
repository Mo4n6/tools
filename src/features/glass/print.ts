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
 * Shortcuts for one use of this panel, not the range of it. Every one of them
 * only writes a width and a height that were already free to type, and the
 * panel takes centimetres and raw pixels just as willingly — nothing here is a
 * setting anybody is confined to. The 22-inch widths are the usual film roll
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

/**
 * Densities worth suggesting. 300 is the usual transfer density; 600 suits
 * fine line art; 72 and 96 are screen conventions.
 *
 * Suggestions, not a menu: the density is a free number, because a tool that
 * enlarges pictures has no business deciding what someone is enlarging them
 * for.
 */
export const DPI_SUGGESTIONS = [72, 96, 150, 300, 600] as const;

/** Densities below or above this are refused as typing mistakes, not choices. */
export const DPI_RANGE = { min: 1, max: 2400 } as const;

export function clampDpi(dpi: number): number {
  if (!Number.isFinite(dpi)) return 300;
  return Math.min(DPI_RANGE.max, Math.max(DPI_RANGE.min, Math.round(dpi)));
}

/**
 * How a target may be expressed.
 *
 * Inches because transfers are sold that way, centimetres because most of the
 * world measures that way, and pixels because plenty of work — a banner, a
 * sprite sheet, an asset for a game — has no physical size at all and asking
 * for one would be a fiction.
 */
export type PrintUnit = 'in' | 'cm' | 'px';

export const UNIT_LABELS: Record<PrintUnit, string> = { in: 'inches', cm: 'cm', px: 'pixels' };

const CM_PER_INCH = 2.54;

/** Converts a length in the given unit to the inches the target is held in. */
export function toInches(value: number, unit: PrintUnit, dpi: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (unit === 'in') return value;
  if (unit === 'cm') return value / CM_PER_INCH;
  return value / clampDpi(dpi);
}

/** Converts inches back out for display in the given unit. */
export function fromInches(inches: number, unit: PrintUnit, dpi: number): number {
  if (unit === 'in') return inches;
  if (unit === 'cm') return inches * CM_PER_INCH;
  return Math.round(inches * clampDpi(dpi));
}

/** The pixel dimensions a target works out to. */
export function targetPixels(target: PrintTarget): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(target.widthInches * target.dpi)),
    height: Math.max(1, Math.round(target.heightInches * target.dpi)),
  };
}

export type FitMode = 'fit' | 'fill';

/**
 * What each mode does, in the operator's terms rather than the geometry's.
 *
 * The difference decides whether part of a design is lost, which is worth
 * saying in the panel rather than leaving to a tooltip nobody hovers over.
 */
export const FIT_MODE_COPY: Record<FitMode, { readonly label: string; readonly description: string }> = {
  fit: {
    label: 'Fit whole',
    description:
      'The whole design sits inside the sheet. Nothing is cropped, and the space left over stays transparent, so no ink is printed there.',
  },
  fill: {
    label: 'Fill sheet',
    description:
      'The design covers the sheet edge to edge. Whatever falls outside is cropped away, so parts of the design can be lost.',
  },
};

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
 * Why a target cannot be rendered, or null when it can.
 *
 * Two allocations have to fit, not one. The sheet itself is the obvious one —
 * inches and density multiply fast, and 22x36 at 600 DPI is 285 megapixels.
 * The other is the resampled source, which in `fill` mode is larger than the
 * sheet by however much the aspect ratios disagree: a tall narrow design on a
 * wide sheet is scaled until it covers the width, and the part hanging off the
 * top and bottom is allocated before it is cropped. A 512x4096 source on a
 * 22x36 inch sheet needs 348 megapixels to produce a 71 megapixel result.
 *
 * Returned rather than thrown so the panel can say this before a run rather
 * than after one.
 */
export function printRefusal(
  source: { readonly width: number; readonly height: number },
  target: PrintTarget,
  mode: FitMode,
): string | null {
  const { width: targetWidth, height: targetHeight } = targetPixels(target);
  const sheet = targetWidth * targetHeight;

  if (sheet > MAX_OUTPUT_PIXELS) {
    return (
      `${target.widthInches}x${target.heightInches} ${UNIT_LABELS.in} at ${target.dpi} DPI is ` +
      `${targetWidth}x${targetHeight} pixels, needing ` +
      `${(outputBytes(targetWidth, targetHeight) / 1024 ** 3).toFixed(1)} GB. ` +
      `Use a lower density or a smaller size.`
    );
  }

  const placement = placeOnTarget(source, target, mode);
  const scaled = placement.width * placement.height;
  if (scaled > MAX_OUTPUT_PIXELS) {
    return (
      `Filling this sheet scales the image to ${placement.width}x${placement.height} before cropping, ` +
      `needing ${(outputBytes(placement.width, placement.height) / 1024 ** 3).toFixed(1)} GB. ` +
      `Fit whole would not, because it never scales past the sheet.`
    );
  }

  return null;
}

/**
 * Renders a result at exactly the target's pixel dimensions.
 *
 * Resampled with the same Lanczos filter the first tier uses, then placed on a
 * transparent canvas. Transparent rather than white on purpose: a white
 * background would be printed as white ink.
 */
export function fitToPrint(source: RgbaImage, target: PrintTarget, mode: FitMode): RgbaImage {
  const refusal = printRefusal(source, target, mode);
  if (refusal) throw new RangeError(refusal);

  const { width: targetWidth, height: targetHeight } = targetPixels(target);
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
