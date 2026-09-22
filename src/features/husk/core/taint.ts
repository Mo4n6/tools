// Taint tracking.
//
// A value is tainted when it derives from something Husk could not faithfully
// compute. Taint carries the gap ids responsible, so any output built from it
// can name exactly what made it unreliable.
//
// This lives in the value model from the first line of code deliberately:
// retrofitting it means rewriting the evaluator. See docs/husk-spec.md
// section 3, commitment 1.

import type { GapId, GapLedger } from './gaps';

/** The set of gaps a value derives from. Empty means the value is trustworthy. */
export type Taint = ReadonlySet<GapId>;

export const CLEAN: Taint = new Set<GapId>();

export function isClean(taint: Taint): boolean {
  return taint.size === 0;
}

export function isTainted(taint: Taint): boolean {
  return taint.size > 0;
}

export function taintFrom(id: GapId): Taint {
  return new Set([id]);
}

/**
 * Combine taint from an iterable of inputs.
 *
 * Prefer this over spreading into `union` whenever the count is unbounded: a
 * PowerShell array built from a multi-megabyte blob has millions of elements,
 * and `union(t, ...items.map(...))` overflows the stack on the spread itself.
 */
export function unionAll(taints: Iterable<Taint>): Taint {
  let only: Taint | undefined;
  let merged: Set<GapId> | undefined;

  for (const t of taints) {
    if (t.size === 0) continue;
    if (merged) {
      for (const id of t) merged.add(id);
      continue;
    }
    if (only === undefined) {
      only = t;
      continue;
    }
    if (only === t) continue;
    merged = new Set(only);
    for (const id of t) merged.add(id);
  }

  if (merged) return merged;
  return only ?? CLEAN;
}

/**
 * Combine taint from several inputs. Returns CLEAN when nothing is tainted,
 * and reuses an input's set when it is the only tainted one, so clean
 * evaluation allocates nothing.
 *
 * Only for a bounded, known-small argument count - see `unionAll`.
 */
export function union(...taints: readonly Taint[]): Taint {
  let only: Taint | undefined;
  let multiple = false;

  for (const t of taints) {
    if (t.size === 0) continue;
    if (only === undefined) {
      only = t;
    } else if (only !== t) {
      multiple = true;
      break;
    }
  }

  if (only === undefined) return CLEAN;
  if (!multiple) return only;

  const merged = new Set<GapId>();
  for (const t of taints) for (const id of t) merged.add(id);
  return merged;
}

/**
 * Combine taint and tell the ledger it spread, which is what feeds blast
 * radius. Use this at evaluation sites; use `union` for bookkeeping that
 * should not inflate the counters.
 */
export function propagate(ledger: GapLedger, ...taints: readonly Taint[]): Taint {
  const result = union(...taints);
  for (const id of result) ledger.propagate(id);
  return result;
}

/** Mark every gap behind this value as having reached analyst-visible output. */
export function markOutput(ledger: GapLedger, taint: Taint): void {
  for (const id of taint) ledger.markReachedOutput(id);
}

/** Human-readable reason a value is unreliable, or undefined if it is clean. */
export function explain(ledger: GapLedger, taint: Taint): string | undefined {
  if (isClean(taint)) return undefined;

  const parts = [...taint]
    .map((id) => ledger.get(id))
    .filter((g): g is NonNullable<typeof g> => g !== undefined)
    .map((g) => `${g.signature} (layer ${g.provenance.layer})`);

  if (parts.length === 0) return 'incomplete - depends on an unrecorded gap';
  return `incomplete - depends on ${parts.join(', ')}`;
}
