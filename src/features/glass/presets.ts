// Known-good weights for the neural tier.
//
// A default that quietly fetches tens of megabytes from a third party is a
// supply-chain decision made on the operator's behalf, which is the thing this
// tier was built to avoid. A preset avoids it differently: nothing is fetched
// until the operator picks one, the URL is pinned to an immutable revision
// rather than a moving branch, and the bytes are checked against a digest
// recorded here before they ever reach the runtime.
//
// The effect is that the host serving the file is infrastructure rather than a
// trusted party. If it returns something other than what was published — a
// swap at the origin, an interfering middlebox, a poisoned cache entry — the
// digest fails and the model never loads.
//
// To add an entry, run `npm run glass:preset -- <url>` on a machine that can
// reach the host. It downloads the candidate, loads it to confirm it is a
// working super-resolution graph, and prints the record to paste in below.
// Entries are added from that output, never from recollection: a wrong digest
// here is indistinguishable from an attack, and a wrong URL is a dead tier.

export interface WeightsPreset {
  readonly id: string;
  readonly label: string;
  /** What this model is actually good at, in the operator's terms. */
  readonly note: string;
  /** Pinned to an immutable revision, so the digest stays meaningful. */
  readonly url: string;
  /** Lowercase hex SHA-256 of the exact bytes at that URL. */
  readonly sha256: string;
  /** Shown before the download starts, so the cost is known in advance. */
  readonly bytes: number;
  /** What the model is expected to do; the real factor is still read back
   *  from its output shape, so a mismatch cannot produce a wrong-sized image. */
  readonly scale: number;
}

/**
 * Populated from `npm run glass:preset` output.
 *
 * Empty ships an honest tier rather than a guessed one: with no entries the UI
 * says so and points at the script, instead of offering a download that may
 *404 or may not be the model it claims.
 */
export const WEIGHTS_PRESETS: readonly WeightsPreset[] = [];

const HEX_64 = /^[0-9a-f]{64}$/;

/**
 * Checks an entry is usable before the UI offers it.
 *
 * Presets are hand-pasted, and every field here is one a typo turns into either
 * a confusing runtime failure or a check that cannot fail.
 */
export function isUsablePreset(preset: WeightsPreset): boolean {
  if (!preset.id || !preset.label) return false;
  if (!HEX_64.test(preset.sha256)) return false;
  if (!Number.isInteger(preset.bytes) || preset.bytes <= 0) return false;
  if (!(preset.scale > 1)) return false;
  try {
    return new URL(preset.url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The entries the UI may offer, with malformed ones withheld. */
export function usablePresets(
  presets: readonly WeightsPreset[] = WEIGHTS_PRESETS,
): readonly WeightsPreset[] {
  return presets.filter(isUsablePreset);
}
