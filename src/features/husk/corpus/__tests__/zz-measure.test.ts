import { describe, it } from 'vitest';
import { fixtures } from '..';
import layered from '../fixtures/layered.json';
import { analyze } from '../../analyze';

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
const hit = (out: string, expected: string): boolean => {
  const o = norm(out); const e = norm(expected);
  return o === e || o.includes(e);
};

async function measure(name: string, cases: { id: string; obfuscated: string; expected: string }[]) {
  let ok = 0, reliable = 0, failed = 0;
  const gapTally = new Map<string, number>();
  for (const f of cases) {
    try {
      const r = await analyze(f.obfuscated);
      if (hit(r.output, f.expected)) ok++; else {
        failed++;
        for (const g of r.actionableGaps.slice(0, 3)) {
          gapTally.set(g.signature, (gapTally.get(g.signature) ?? 0) + 1);
        }
      }
      if (r.reliable) reliable++;
    } catch { failed++; }
  }
  const pct = (n: number) => ((n / cases.length) * 100).toFixed(1);
  console.log(`\n### ${name}  n=${cases.length}`);
  console.log(`  recovered expected : ${ok} (${pct(ok)}%)`);
  console.log(`  self-reported ok   : ${reliable} (${pct(reliable)}%)`);
  const top = [...gapTally].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length) {
    console.log('  top blockers on failures:');
    for (const [sig, n] of top) console.log(`    ${String(n).padStart(4)}x ${sig}`);
  }
}

describe('coverage measurement', () => {
  it('measures', async () => {
    await measure('single-transform', fixtures as never);
    await measure('layered', (layered as { fixtures: never[] }).fixtures);
  }, 600_000);
});
