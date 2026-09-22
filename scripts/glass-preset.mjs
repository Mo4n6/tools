// Turns a candidate .onnx URL into a Glass preset record.
//
// Presets pin a digest so the host serving the weights does not have to be
// trusted. That guarantee is only as good as the digest, so it is produced by
// downloading the exact bytes and hashing them here — never transcribed from a
// model card, and never recalled from memory.
//
// The script also loads the graph and runs one small tile through it, because
// a preset that passes its digest check and then turns out not to be a
// super-resolution model has simply moved the failure later.
//
//   npm run glass:preset -- https://huggingface.co/<repo>/resolve/<sha>/model.onnx
//
// Pass a revision in the URL rather than a branch name: a branch moves, and a
// digest pinned against a moving target is a check that will fail one day for
// no reason anyone remembers.

import { createHash } from 'node:crypto';

const TILE = 64;

function fail(message) {
  console.error(`glass-preset: ${message}`);
  process.exit(1);
}

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

const url = process.argv[2];
if (!url) fail('usage: npm run glass:preset -- <https url to a .onnx file>');

let parsed;
try {
  parsed = new URL(url);
} catch {
  fail(`not a URL: ${url}`);
}
// Matches what Glass itself accepts: https anywhere, cleartext on loopback so
// a locally served candidate can be checked before it is published.
const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
  fail('presets must be https, or http on localhost; Glass refuses anything else');
}
if (!loopback && !/\/(resolve|raw)\/[0-9a-f]{7,40}\//.test(parsed.pathname) && !parsed.pathname.includes('@')) {
  console.warn(
    'glass-preset: warning — this URL does not look pinned to a revision. A branch URL can ' +
      'change under the digest, which turns a future fetch into a failed check.',
  );
}

console.log(`glass-preset: fetching ${url}`);
const response = await fetch(url, { redirect: 'follow' });
if (!response.ok) fail(`${response.status} ${response.statusText}`);

const buffer = Buffer.from(await response.arrayBuffer());
const sha256 = createHash('sha256').update(buffer).digest('hex');
console.log(`glass-preset: ${describeBytes(buffer.byteLength)} (${buffer.byteLength} bytes), sha256 ${sha256}`);

// Load it for real. An ONNX file that will not open, or that does not enlarge
// what it is given, is not a preset however well it hashes.
const ort = await import('onnxruntime-node');
let session;
try {
  session = await ort.InferenceSession.create(buffer);
} catch (error) {
  fail(`onnxruntime could not load this file: ${error instanceof Error ? error.message : error}`);
}

const inputName = session.inputNames[0];
const outputName = session.outputNames[0];
console.log(`glass-preset: input "${inputName}", output "${outputName}"`);

let scale;
try {
  const probe = new ort.Tensor('float32', new Float32Array(3 * TILE * TILE).fill(0.5), [1, 3, TILE, TILE]);
  const outputs = await session.run({ [inputName]: probe });
  const dims = outputs[outputName].dims;
  const height = Number(dims[dims.length - 2]);
  scale = height / TILE;
  console.log(`glass-preset: ${TILE}x${TILE} in, ${dims.join('x')} out -> ${scale}x`);
} catch (error) {
  fail(
    `the graph loaded but would not run a ${TILE}x${TILE} RGB tile, so Glass cannot tile with it: ` +
      `${error instanceof Error ? error.message : error}`,
  );
}

if (!(scale > 1)) fail(`this model produces ${scale}x output; it does not upscale`);

const id = (parsed.pathname.split('/').pop() ?? 'model').replace(/\.onnx$/i, '').toLowerCase();

console.log('\nglass-preset: paste into WEIGHTS_PRESETS in src/features/glass/presets.ts\n');
console.log(
  [
    '  {',
    `    id: '${id}',`,
    `    label: '<short name>',`,
    `    note: '<what this one is good at>',`,
    `    url: '${url}',`,
    `    sha256: '${sha256}',`,
    `    bytes: ${buffer.byteLength},`,
    `    scale: ${scale},`,
    '  },',
  ].join('\n'),
);
