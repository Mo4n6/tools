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
  /**
   * Shown before the download starts, so the cost is known in advance.
   *
   * Optional, because it is only known by fetching the file. An entry added
   * from a digest supplied elsewhere has no size until someone runs the helper
   * against it, and inventing a number would be worse than showing none.
   */
  readonly bytes?: number;
  /** What the model is expected to do; the real factor is still read back
   *  from its output shape, so a mismatch cannot produce a wrong-sized image. */
  readonly scale: number;
}

/**
 * Populated from `npm run glass:preset` output.
 *
 * PROVENANCE: these three digests were supplied rather than computed in the
 * environment that first added them, and were confirmed afterwards against
 * copies downloaded from these exact URLs — every one matched, and the sizes
 * below were measured at the same time.
 *
 * What is still unconfirmed is how each behaves once loaded. None has been run
 * through Glass, so the factors below are what the exports are named for
 * rather than what was observed. That costs nothing in correctness: the real
 * factor is read back from the model's output shape at run time, so a wrong
 * label here changes what the dropdown says and not what the tier produces.
 *
 * To add an entry, or to re-check one:
 *
 *   npm run glass:preset -- <url> [expected-sha256]
 *
 * It hashes the bytes, loads the graph, and pushes a tile through it, which is
 * the one thing a digest cannot tell you: a model with a fixed input size
 * hashes perfectly well and then cannot be tiled.
 */
export const WEIGHTS_PRESETS: readonly WeightsPreset[] = [
  {
    id: 'realesrgan-general-x4v3',
    label: 'Real-ESRGAN general x4v3',
    note: 'A small, fast general-purpose model. The one to try first.',
    url: 'https://huggingface.co/EasyImageSharp/EasyImageSharp-models/resolve/749ac2375f4bb2aa67825ecec197e8e03eb293f0/realesrgan_general_x4v3.onnx',
    sha256: 'aaa2b465d2258bdcc30d51076bc358da00d1595d2fa05697979e782f97de325a',
    bytes: 4867416,
    scale: 4,
  },
  {
    id: 'real-esrgan-x4',
    label: 'Real-ESRGAN x4plus',
    note: 'The full x4 model. Slower, and stronger on photographs.',
    url: 'https://huggingface.co/SceneWorks/real-esrgan-onnx/resolve/09f741bac80a246b407da3ee902bf5f3291b602f/real_esrgan_x4.onnx',
    sha256: '5c586662929cbc686c1a5c38d9c060dbdb4ea5863a1f7672b8c0761e6b89c033',
    bytes: 67051616,
    scale: 4,
  },
  {
    id: 'real-esrgan-x2',
    label: 'Real-ESRGAN x2plus',
    note: 'Doubles rather than quadruples, for when 4x is more than you want.',
    url: 'https://huggingface.co/SceneWorks/real-esrgan-onnx/resolve/09f741bac80a246b407da3ee902bf5f3291b602f/real_esrgan_x2.onnx',
    sha256: '7115ba92e8a1bfa63d68558ef006ef3d91273a068d321b1439f8bb1c9179002c',
    bytes: 67073434,
    scale: 2,
  },
];

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
  if (preset.bytes !== undefined && (!Number.isInteger(preset.bytes) || preset.bytes <= 0)) return false;
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
