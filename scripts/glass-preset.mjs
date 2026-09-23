// Turns candidate .onnx URLs into Glass preset records.
//
// Presets pin a digest so the host serving the weights does not have to be
// trusted. That guarantee is only as good as the digest, so it is produced by
// downloading the exact bytes and hashing them here — never transcribed from a
// model card. A published hash may describe a different export, a different
// revision, or simply be stale; and a preset whose digest is wrong fails in
// the browser with a message that reads like an attack rather than a typo.
//
// The script also loads each graph and runs a small tile through it, because a
// model that passes its digest check and then turns out to have a fixed input
// size cannot be tiled, and Glass tiles everything.
//
//   npm run glass:preset -- <url> [expected-sha256] [<url> [expected-sha256] ...]
//
// A bare 64-character hex argument is read as the expected digest of the URL
// before it, and is checked rather than trusted: if it disagrees with the
// bytes, the script says so and does not emit a record.
//
// Pass revision URLs rather than branch names. A branch moves, and a digest
// pinned against a moving target is a check that will fail one day for no
// reason anyone remembers.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const TILE = 64;
const HEX_64 = /^[0-9a-f]{64}$/i;

function describeBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/** Splits the argument list into { url, expected } jobs. */
function parseJobs(args) {
  const jobs = [];
  for (const arg of args) {
    if (HEX_64.test(arg)) {
      const previous = jobs[jobs.length - 1];
      if (!previous) throw new Error(`digest ${arg.slice(0, 12)}… has no URL before it`);
      if (previous.expected) throw new Error(`two digests given for ${previous.url}`);
      previous.expected = arg.toLowerCase();
      continue;
    }
    jobs.push({ url: arg, expected: null });
  }
  return jobs;
}

function checkUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: `not a URL: ${url}` };
  }

  // Matches what Glass itself accepts: https anywhere, cleartext on loopback so
  // a locally served candidate can be checked before it is published.
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
    return { ok: false, reason: 'must be https, or http on localhost' };
  }

  const pinned =
    loopback || /\/(resolve|raw)\/[0-9a-f]{7,40}\//.test(parsed.pathname) || parsed.pathname.includes('@');
  return { ok: true, parsed, pinned };
}

async function inspect(job, ort) {
  const { url, expected } = job;
  const check = checkUrl(url);
  if (!check.ok) return { url, error: check.reason };

  // fetch rejects rather than resolving for DNS, TLS, timeout and reset
  // failures, and reading the body can fail part-way through. Either would
  // escape to the top level and end the run, which defeats the point of
  // batching: one flaky host would cost every candidate after it.
  let buffer;
  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) return { url, error: `${response.status} ${response.statusText}` };
    buffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    return { url, error: `could not fetch it: ${error instanceof Error ? error.message : error}` };
  }

  const sha256 = createHash('sha256').update(buffer).digest('hex');

  // Checked, not trusted. This is the whole reason the script exists.
  if (expected && expected !== sha256) {
    return {
      url,
      error:
        `digest mismatch — you supplied ${expected}\n` +
        `                       the bytes are ${sha256}\n` +
        `    The supplied digest does not describe this file. Do not ship it: a preset with a ` +
        `wrong digest fails in the browser as if the download had been tampered with.`,
    };
  }

  let session;
  try {
    session = await ort.InferenceSession.create(buffer);
  } catch (error) {
    return { url, error: `onnxruntime could not load it: ${error instanceof Error ? error.message : error}` };
  }

  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  let scale;
  try {
    const probe = new ort.Tensor('float32', new Float32Array(3 * TILE * TILE).fill(0.5), [1, 3, TILE, TILE]);
    const outputs = await session.run({ [inputName]: probe });
    const dims = outputs[outputName].dims;
    scale = Number(dims[dims.length - 2]) / TILE;
  } catch (error) {
    return {
      url,
      error:
        `loaded, but will not run a ${TILE}x${TILE} RGB tile, so Glass cannot tile with it ` +
        `(a fixed input size does this): ${error instanceof Error ? error.message : error}`,
    };
  }

  if (!(scale > 1)) return { url, error: `produces ${scale}x output; it does not upscale` };

  return {
    url,
    sha256,
    bytes: buffer.byteLength,
    scale,
    inputName,
    outputName,
    pinned: check.pinned,
    confirmed: Boolean(expected),
  };
}

/** Lowercase, hyphenated, safe to paste as an id. */
function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Reads the ids already in presets.ts, so a generated one cannot collide with
 * an entry that is already shipping.
 *
 * Best effort: the file is TypeScript and this is a plain script, so it is
 * scanned rather than imported. Failing to read it costs uniqueness against
 * existing entries, which the test suite catches anyway.
 */
function existingIds() {
  try {
    const source = readFileSync(path.join(process.cwd(), 'src/features/glass/presets.ts'), 'utf8');
    return new Set([...source.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]));
  } catch {
    return new Set();
  }
}

/**
 * Derives an id that is actually distinct.
 *
 * The filename alone is not enough: exports are routinely called `model.onnx`,
 * so two repositories in one batch would produce one id twice. Duplicated ids
 * survive the paste and then quietly break selection, because the picker
 * resolves a preset by finding the first match. So the bare stem is preferred,
 * and qualified with the repository when it is taken.
 */
function deriveId(url, taken) {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  const stem = (segments[segments.length - 1] ?? 'model').replace(/\.onnx$/i, '');

  // Everything before the revision marker names the repository.
  const marker = segments.findIndex((segment) => segment === 'resolve' || segment === 'raw');
  const repo = marker > 0 ? segments.slice(0, marker) : [];

  const candidates = [
    stem,
    [...repo.slice(-1), stem].join('-'),
    [...repo.slice(-2), stem].join('-'),
  ];

  for (const candidate of candidates) {
    const id = slug(candidate);
    if (id && !taken.has(id)) return id;
  }

  const base = slug([...repo.slice(-2), stem].join('-')) || 'model';
  for (let n = 2; ; n += 1) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

const jobs = (() => {
  try {
    return parseJobs(process.argv.slice(2));
  } catch (error) {
    console.error(`glass-preset: ${error.message}`);
    process.exit(1);
  }
})();

if (jobs.length === 0) {
  console.error('glass-preset: usage: npm run glass:preset -- <url> [expected-sha256] [<url> ...]');
  process.exit(1);
}

const ort = await import('onnxruntime-node');
const results = [];

for (const job of jobs) {
  process.stdout.write(`glass-preset: ${job.url}\n`);
  const result = await inspect(job, ort);
  results.push(result);

  if (result.error) {
    console.error(`  REJECTED: ${result.error}\n`);
    continue;
  }
  if (!result.pinned) {
    console.warn('  warning: this URL is not pinned to a revision; it can change under the digest');
  }
  console.log(
    `  ok: ${describeBytes(result.bytes)}, ${result.scale}x, in "${result.inputName}" out "${result.outputName}"` +
      `${result.confirmed ? ', supplied digest confirmed' : ''}`,
  );
  console.log(`  sha256 ${result.sha256}\n`);
}

const usable = results.filter((result) => !result.error);
if (usable.length === 0) {
  console.error('glass-preset: nothing usable.');
  process.exit(1);
}

console.log(`glass-preset: paste into WEIGHTS_PRESETS in src/features/glass/presets.ts\n`);
const taken = existingIds();
for (const result of usable) {
  const id = deriveId(result.url, taken);
  taken.add(id);
  console.log(
    [
      '  {',
      `    id: '${id}',`,
      `    label: '<short name>',`,
      `    note: '<what this one is good at>',`,
      `    url: '${result.url}',`,
      `    sha256: '${result.sha256}',`,
      `    bytes: ${result.bytes},`,
      `    scale: ${result.scale},`,
      '  },',
    ].join('\n'),
  );
}

if (results.some((result) => result.error)) process.exitCode = 1;
