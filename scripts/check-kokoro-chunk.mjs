import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const isKokoroEnabled = process.env.VITE_ENABLE_KOKORO !== 'false';

if (!isKokoroEnabled) {
  console.log('[check-kokoro-chunk] VITE_ENABLE_KOKORO=false; skipping Kokoro chunk validation.');
  process.exit(0);
}

const assetsDir = join(process.cwd(), 'dist', 'assets');
if (!existsSync(assetsDir)) {
  console.error(`[check-kokoro-chunk] Missing assets directory: ${assetsDir}`);
  process.exit(1);
}

const files = readdirSync(assetsDir);
const kokoroChunk = files.find((file) => /^kokoro-[\w-]+\.js$/i.test(file));

if (!kokoroChunk) {
  console.error('[check-kokoro-chunk] Kokoro is enabled but no Kokoro chunk was emitted in dist/assets.');
  console.error('[check-kokoro-chunk] Expected a file matching: kokoro-<hash>.js');
  process.exit(1);
}

console.log(`[check-kokoro-chunk] Found Kokoro chunk: ${kokoroChunk}`);
