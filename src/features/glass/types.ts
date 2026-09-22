// Shared vocabulary for the three upscaling tiers.
//
// The tiers are presented to the operator rather than chosen for them: each one
// trades a different resource (time, download size, fidelity) and only the
// person looking at the image knows which trade is the right one.

/** Raw pixels, decoupled from the DOM so workers and tests can carry them. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /**
   * Straight (non-premultiplied) RGBA, 4 bytes per pixel, row-major.
   *
   * Pinned to a plain ArrayBuffer rather than ArrayBufferLike: these buffers
   * are handed to ImageData and transferred to workers, and neither accepts
   * the SharedArrayBuffer the looser type would also admit.
   */
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}

export type TierId = 'lanczos' | 'pixel' | 'neural';

export interface TierDescriptor {
  readonly id: TierId;
  readonly label: string;
  /** One line describing the mechanism, not the marketing. */
  readonly summary: string;
  /** What this tier is actually the right answer for. */
  readonly bestFor: string;
  /** Where the work happens, so the cost is visible before it is paid. */
  readonly runsOn: string;
  /** Bytes fetched over the network before the tier can run. */
  readonly download: string;
  /** Scale factors the tier can produce. */
  readonly scales: readonly number[];
}

export type GlassPhase = 'idle' | 'decoding' | 'running' | 'done' | 'error';

export interface GlassProgress {
  /** Human-readable stage, e.g. "tile 3/16". */
  readonly note: string;
  /** Completed fraction in [0, 1], or null when the work is not divisible. */
  readonly fraction: number | null;
}
