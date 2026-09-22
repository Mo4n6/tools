import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
const s = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { analyze } = await s.ssrLoadModule('/src/features/husk/analyze.ts');
const SP = '/tmp/claude-0/-home-user-tools/f3a22558-a597-5b7f-9b79-8800b44be306/scratchpad/mps';
const files = [];
for (const d of ['bazaar_out', 'triage_out']) for (const f of readdirSync(`${SP}/${d}`)) {
  const p = join(SP, d, f); try { if (statSync(p).size <= 300000) files.push(p); } catch {}
}
files.sort();
const step = Math.max(1, Math.floor(files.length / 300));
let shown = 0;
for (const p of files.filter((_, i) => i % step === 0).slice(0, 300)) {
  const src = readFileSync(p, 'utf8');
  try {
    const r = await analyze(src, { timeBudgetMs: 4000 });
    if (!(r.layers.length === 1 && r.iocs.indicators.length === 0 && r.events.length === 0 && r.reliable)) continue;
    console.log(`\n--- ${p.split('/').pop().slice(0, 20)} (${src.length}b)`);
    console.log(src.replace(/\s+/g, ' ').slice(0, 260));
    if (++shown >= 4) break;
  } catch {}
}
await s.close();
