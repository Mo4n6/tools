import { describe, expect, it } from 'vitest';

import { GapLedger, type GapSeed } from '../gaps';

const seed = (
  signature: string,
  kind: GapSeed['kind'] = 'GAP',
  argTypes: string[] = [],
): GapSeed => ({ kind, signature, argTypes, provenance: { layer: 0 } });

describe('deduplication', () => {
  it('returns one id for a repeated signature', () => {
    const ledger = new GapLedger();
    const first = ledger.report(seed('[X]::Y()'));
    const second = ledger.report(seed('[X]::Y()'));

    expect(second).toBe(first);
    expect(ledger.size).toBe(1);
  });

  it('keeps the first provenance, which is where an implementer should look', () => {
    const ledger = new GapLedger();
    const id = ledger.report({ ...seed('[X]::Y()'), provenance: { layer: 1, line: 4 } });
    ledger.report({ ...seed('[X]::Y()'), provenance: { layer: 9, line: 99 } });

    expect(ledger.get(id)?.provenance).toEqual({ layer: 1, line: 4 });
  });

  it('separates the same signature reported under different kinds', () => {
    const ledger = new GapLedger();
    ledger.report(seed('Invoke-WebRequest', 'GAP'));
    ledger.report(seed('Invoke-WebRequest', 'STUB_BY_DESIGN'));

    expect(ledger.size).toBe(2);
  });

  it('separates calls distinguished only by argument types', () => {
    const ledger = new GapLedger();
    ledger.report(seed('[X]::Y()', 'GAP', ['System.String']));
    ledger.report(seed('[X]::Y()', 'GAP', ['System.Byte[]']));

    expect(ledger.size).toBe(2);
  });
});

describe('ranking the implementation queue', () => {
  it('puts output-reaching gaps first even with a small blast radius', () => {
    const ledger = new GapLedger();
    const wide = ledger.report(seed('[Wide]::M()'));
    const narrow = ledger.report(seed('[Narrow]::M()'));

    for (let i = 0; i < 50; i += 1) ledger.propagate(wide);
    ledger.propagate(narrow);
    ledger.markReachedOutput(narrow);

    expect(ledger.ranked().map((g) => g.signature)).toEqual([
      '[Narrow]::M()',
      '[Wide]::M()',
    ]);
  });

  it('orders by blast radius within the same output status', () => {
    const ledger = new GapLedger();
    const small = ledger.report(seed('[Small]::M()'));
    const big = ledger.report(seed('[Big]::M()'));

    ledger.propagate(small);
    ledger.propagate(big);
    ledger.propagate(big);

    expect(ledger.ranked()[0].signature).toBe('[Big]::M()');
  });

  it('breaks ties deterministically so the queue is stable between runs', () => {
    const ledger = new GapLedger();
    ledger.report(seed('[B]::M()'));
    ledger.report(seed('[A]::M()'));

    expect(ledger.ranked().map((g) => g.signature)).toEqual(['[A]::M()', '[B]::M()']);
  });
});

describe('separating the three kinds', () => {
  // Conflating "implement this" with "working as intended" and "nothing will
  // fix this" is what turns the report into noise.
  it('excludes by-design stubs and hard blocks from the actionable queue', () => {
    const ledger = new GapLedger();
    ledger.report(seed('[Real]::Gap()', 'GAP'));
    ledger.report(seed('Net.WebClient.DownloadString', 'STUB_BY_DESIGN'));
    ledger.report(seed('$env:USERDOMAIN key derivation', 'HARD_BLOCK'));

    expect(ledger.actionable().map((g) => g.signature)).toEqual(['[Real]::Gap()']);
    expect(ledger.ranked()).toHaveLength(3);
  });

  it('can list each kind on its own for the report panel', () => {
    const ledger = new GapLedger();
    ledger.report(seed('a', 'GAP'));
    ledger.report(seed('b', 'GAP'));
    ledger.report(seed('c', 'HARD_BLOCK'));

    expect(ledger.byKind('GAP')).toHaveLength(2);
    expect(ledger.byKind('HARD_BLOCK')).toHaveLength(1);
    expect(ledger.byKind('STUB_BY_DESIGN')).toHaveLength(0);
  });
});

describe('unknown ids', () => {
  it('ignores propagation for an id that was never reported', () => {
    const ledger = new GapLedger();
    expect(() => ledger.propagate('nope')).not.toThrow();
    expect(ledger.size).toBe(0);
  });
});
