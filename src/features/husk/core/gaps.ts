// Gap records: everything Husk could not faithfully compute.
//
// The project's contract is that it never lies about coverage. A member Husk
// does not implement must not quietly return null and produce a plausible,
// wrong final stage; it records a gap, taints the value, and keeps going.
//
// See docs/husk-spec.md section 7.

/**
 * Why a value could not be computed. These three are never conflated: mixing
 * "we should implement this" with "this is working as intended" and "nothing
 * will ever fix this" turns the report into noise.
 */
export type GapKind =
  /** Unimplemented member, cmdlet or syntax. Action: implement it. */
  | 'GAP'
  /** Network, process creation, filesystem write. Action: none, by design. */
  | 'STUB_BY_DESIGN'
  /** Environmental keying, dead C2, embedded PE. Action: none possible. */
  | 'HARD_BLOCK';

export type GapId = string;

/** Where in the decode chain something happened. */
export interface Provenance {
  /** Index of the decoded layer. 0 is the pasted input. */
  readonly layer: number;
  /** Offset into that layer's source text, if known. */
  readonly offset?: number;
  readonly line?: number;
  readonly column?: number;
}

export interface GapRecord {
  readonly id: GapId;
  readonly kind: GapKind;
  /** e.g. "[System.Security.Cryptography.Aes]::Create()" */
  readonly signature: string;
  /** Observed argument type names, for generating a stub skeleton. */
  readonly argTypes: readonly string[];
  readonly provenance: Provenance;
  /** Free-text detail; never the payload itself. */
  readonly detail?: string;
  /**
   * How many values this gap went on to taint. The implementation queue is
   * sorted by this, so the top row is literally "implement this next".
   */
  readonly blastRadius: number;
  /** Whether any final output depends on this gap. */
  readonly reachedOutput: boolean;
}

/** A gap as reported, before the ledger assigns it an id and counters. */
export type GapSeed = Omit<GapRecord, 'id' | 'blastRadius' | 'reachedOutput'>;

const keyOf = (seed: GapSeed): string =>
  `${seed.kind}\u0000${seed.signature}\u0000${seed.argTypes.join(',')}`;

/**
 * Collects gaps for a run and tracks how far each one spread.
 *
 * Gaps are deduplicated by kind and signature: a member called in a loop is
 * one gap with a large blast radius, not ten thousand records.
 */
export class GapLedger {
  private readonly byKey = new Map<string, GapId>();
  private readonly records = new Map<GapId, GapRecord>();
  private nextId = 0;

  /**
   * Record a gap, or return the existing id if this signature was already
   * seen. The first occurrence's provenance is kept, since that is where an
   * implementer should look.
   */
  report(seed: GapSeed): GapId {
    const key = keyOf(seed);
    const existing = this.byKey.get(key);
    if (existing !== undefined) return existing;

    const id: GapId = `g${this.nextId++}`;
    this.byKey.set(key, id);
    this.records.set(id, { ...seed, id, blastRadius: 0, reachedOutput: false });
    return id;
  }

  /** Note that this gap's taint propagated into another value. */
  propagate(id: GapId): void {
    const record = this.records.get(id);
    if (!record) return;
    this.records.set(id, { ...record, blastRadius: record.blastRadius + 1 });
  }

  /** Note that output the analyst will read depends on this gap. */
  markReachedOutput(id: GapId): void {
    const record = this.records.get(id);
    if (!record || record.reachedOutput) return;
    this.records.set(id, { ...record, reachedOutput: true });
  }

  get(id: GapId): GapRecord | undefined {
    return this.records.get(id);
  }

  get size(): number {
    return this.records.size;
  }

  /**
   * Every gap, ranked for action: output-reaching first, then by blast radius.
   * A gap that tainted nothing is cosmetic; one the final stage depends on is
   * blocking, however few values it touched.
   */
  ranked(): readonly GapRecord[] {
    return [...this.records.values()].sort((a, b) => {
      if (a.reachedOutput !== b.reachedOutput) return a.reachedOutput ? -1 : 1;
      if (a.blastRadius !== b.blastRadius) return b.blastRadius - a.blastRadius;
      return a.signature.localeCompare(b.signature);
    });
  }

  /** Only the gaps worth implementing, ranked. */
  actionable(): readonly GapRecord[] {
    return this.ranked().filter((g) => g.kind === 'GAP');
  }

  byKind(kind: GapKind): readonly GapRecord[] {
    return this.ranked().filter((g) => g.kind === kind);
  }
}
