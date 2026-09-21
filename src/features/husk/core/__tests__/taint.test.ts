import { describe, expect, it } from 'vitest';

import { GapLedger, type GapSeed } from '../gaps';
import { CLEAN, explain, isClean, isTainted, markOutput, propagate, taintFrom, union } from '../taint';

const seed = (signature: string, kind: GapSeed['kind'] = 'GAP'): GapSeed => ({
  kind,
  signature,
  argTypes: [],
  provenance: { layer: 0 },
});

describe('taint sets', () => {
  it('treats the empty set as clean', () => {
    expect(isClean(CLEAN)).toBe(true);
    expect(isTainted(CLEAN)).toBe(false);
  });

  it('unions to CLEAN when nothing is tainted', () => {
    expect(union(CLEAN, CLEAN, CLEAN)).toBe(CLEAN);
  });

  it('reuses the single tainted input rather than allocating', () => {
    const t = taintFrom('g0');
    expect(union(CLEAN, t, CLEAN)).toBe(t);
  });

  it('merges distinct taints', () => {
    const merged = union(taintFrom('g0'), taintFrom('g1'));
    expect([...merged].sort()).toEqual(['g0', 'g1']);
  });

  it('deduplicates the same gap arriving by two paths', () => {
    const a = taintFrom('g0');
    const b = taintFrom('g0');
    expect([...union(a, b)]).toEqual(['g0']);
  });
});

describe('blast radius', () => {
  it('counts each propagation of a gap', () => {
    const ledger = new GapLedger();
    const id = ledger.report(seed('[X]::Y()'));
    const t = taintFrom(id);

    propagate(ledger, t);
    propagate(ledger, t, CLEAN);
    propagate(ledger, t);

    expect(ledger.get(id)?.blastRadius).toBe(3);
  });

  it('does not count plain unions, so bookkeeping cannot inflate it', () => {
    const ledger = new GapLedger();
    const id = ledger.report(seed('[X]::Y()'));
    union(taintFrom(id), CLEAN);
    expect(ledger.get(id)?.blastRadius).toBe(0);
  });

  it('counts every gap in a merged taint', () => {
    const ledger = new GapLedger();
    const a = ledger.report(seed('[A]::M()'));
    const b = ledger.report(seed('[B]::N()'));
    propagate(ledger, taintFrom(a), taintFrom(b));

    expect(ledger.get(a)?.blastRadius).toBe(1);
    expect(ledger.get(b)?.blastRadius).toBe(1);
  });
});

describe('explaining unreliable output', () => {
  it('says nothing about clean values', () => {
    expect(explain(new GapLedger(), CLEAN)).toBeUndefined();
  });

  it('names the gap and the layer it came from', () => {
    const ledger = new GapLedger();
    const id = ledger.report({
      kind: 'GAP',
      signature: '[System.Security.Cryptography.Aes]::Create()',
      argTypes: [],
      provenance: { layer: 3 },
    });

    const message = explain(ledger, taintFrom(id));
    expect(message).toContain('Aes]::Create()');
    expect(message).toContain('layer 3');
    expect(message).toContain('incomplete');
  });

  it('degrades gracefully when a taint references an unknown gap', () => {
    expect(explain(new GapLedger(), taintFrom('nope'))).toContain('unrecorded');
  });
});

describe('reaching output', () => {
  it('marks every gap behind a value', () => {
    const ledger = new GapLedger();
    const a = ledger.report(seed('[A]::M()'));
    const b = ledger.report(seed('[B]::N()'));

    markOutput(ledger, union(taintFrom(a), taintFrom(b)));

    expect(ledger.get(a)?.reachedOutput).toBe(true);
    expect(ledger.get(b)?.reachedOutput).toBe(true);
  });
});
