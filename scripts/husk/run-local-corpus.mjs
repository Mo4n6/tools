// Runs Husk over a directory of local samples and reports aggregate behaviour.
//
// The synthetic corpus in src/features/husk/corpus/ proves specific transforms
// are undone. This answers a different question: over real, messy, unselected
// input, does Husk crash, hang, or - worst of all - report a clean result on a
// sample it never understood?
//
// Samples are NEVER committed to this repository. Point this at a directory
// outside the tree. Suggested sources are listed in src/features/husk/README.md.
//
// Usage:
//   node scripts/husk/run-local-corpus.mjs <dir> [--limit 300] [--max-bytes 300000]
//
// Exit code is non-zero if any sample crashed or produced a false clean, so
// this can gate a release.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

function parseArgs(argv) {
  const dirs = [];
  const opts = { limit: 300, maxBytes: 300_000, timeBudgetMs: 4000, maxLayers: 24 };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') opts.limit = Number(argv[++i]);
    else if (arg === '--max-bytes') opts.maxBytes = Number(argv[++i]);
    else if (arg === '--time-budget') opts.timeBudgetMs = Number(argv[++i]);
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else dirs.push(arg);
  }

  if (dirs.length === 0) {
    console.error('usage: node scripts/husk/run-local-corpus.mjs <dir…> [--limit N] [--max-bytes N]');
    process.exit(1);
  }
  return { dirs, opts };
}

/** Files under the size cap, spread evenly across the set rather than the first N. */
function collect(dirs, { limit, maxBytes }) {
  const files = [];
  for (const dir of dirs) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      console.error(`cannot read ${dir}: ${error.message}`);
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const path = join(dir, entry.name);
      try {
        if (statSync(path).size <= maxBytes) files.push(path);
      } catch {
        /* unreadable; skip */
      }
    }
  }

  files.sort();
  const step = Math.max(1, Math.floor(files.length / limit));
  return files.filter((_, i) => i % step === 0).slice(0, limit);
}

const { dirs, opts } = parseArgs(process.argv.slice(2));
const chosen = collect(dirs, opts);
if (chosen.length === 0) {
  console.error('no readable samples found under the size cap');
  process.exit(1);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { analyze } = await server.ssrLoadModule('/src/features/husk/analyze.ts');

const stats = { crashed: 0, falseClean: 0, withIocs: 0, unwrapped: 0, slow: 0, totalMs: 0 };
const gapCounts = new Map();
const crashes = [];
const falseCleans = [];

for (const path of chosen) {
  let source;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    continue;
  }

  const started = Date.now();
  try {
    const result = await analyze(source, {
      timeBudgetMs: opts.timeBudgetMs,
      maxLayers: opts.maxLayers,
    });
    const elapsed = Date.now() - started;
    stats.totalMs += elapsed;

    if (elapsed > opts.timeBudgetMs * 0.75) stats.slow += 1;
    if (result.layers.length > 1) stats.unwrapped += 1;
    if (result.iocs.indicators.length > 0) stats.withIocs += 1;

    // The outcome that matters most: analysed nothing, recognised nothing,
    // and said so was fine. See docs/husk-spec.md section 2.
    const nothingFound =
      result.layers.length === 1 && result.iocs.indicators.length === 0 && result.events.length === 0;
    if (nothingFound && result.reliable) {
      stats.falseClean += 1;
      falseCleans.push(path);
    }

    for (const gap of result.gaps) {
      if (gap.kind !== 'GAP') continue;
      gapCounts.set(gap.signature, (gapCounts.get(gap.signature) ?? 0) + 1);
    }
  } catch (error) {
    stats.crashed += 1;
    crashes.push(`${path}: ${error.message}`);
  }
}

const n = chosen.length;
const pct = (v) => `${((v / n) * 100).toFixed(1)}%`;

console.log(`\nsamples: ${n}   avg ${(stats.totalMs / n).toFixed(0)}ms   total ${(stats.totalMs / 1000).toFixed(1)}s`);
console.log(`  crashed:            ${stats.crashed}`);
console.log(`  near time budget:   ${stats.slow}`);
console.log(`  unwrapped a layer:  ${stats.unwrapped} (${pct(stats.unwrapped)})`);
console.log(`  yielded indicators: ${stats.withIocs} (${pct(stats.withIocs)})`);
console.log(`  FALSE CLEANS:       ${stats.falseClean}`);

if (gapCounts.size > 0) {
  console.log('\ntop unimplemented constructs:');
  for (const [signature, count] of [...gapCounts].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${String(count).padStart(5)}x  ${signature.slice(0, 90)}`);
  }
}

for (const line of crashes.slice(0, 5)) console.log(`\nCRASH ${line.slice(0, 160)}`);
for (const line of falseCleans.slice(0, 5)) console.log(`\nFALSE CLEAN ${line}`);

await server.close();
process.exit(stats.crashed > 0 || stats.falseClean > 0 ? 1 : 0);
