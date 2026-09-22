import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Glass's neural tier does not carry its own copy of the ONNX Runtime
// WebAssembly binary. The runtime locates it relative to import.meta.url, and
// the build rewrites that to a hashed asset under the deploy base path.
//
// That rewrite is the whole mechanism, and it is invisible: if a Vite or
// onnxruntime-web upgrade stopped performing it, nothing would fail until an
// operator picked the neural tier and got a 404 from a URL nobody wrote. This
// guard asserts the binary was emitted and that a chunk actually points at it.

const distDir = join(process.cwd(), 'dist');
const assetsDir = join(distDir, 'assets');

if (!existsSync(assetsDir)) {
  console.error(`[check-ort-asset] Missing assets directory: ${assetsDir}`);
  process.exit(1);
}

const files = readdirSync(assetsDir);
const wasmAssets = files.filter((file) => /^ort-wasm-.*\.wasm$/i.test(file));

if (wasmAssets.length === 0) {
  console.error('[check-ort-asset] No ONNX Runtime .wasm asset was emitted into dist/assets.');
  console.error('[check-ort-asset] Expected a file matching: ort-wasm-<...>.wasm');
  process.exit(1);
}

if (wasmAssets.length > 1) {
  console.error(`[check-ort-asset] Expected one runtime binary, found ${wasmAssets.length}: ${wasmAssets.join(', ')}`);
  console.error('[check-ort-asset] Duplicates mean the 20 MB binary ships more than once.');
  process.exit(1);
}

const [wasmAsset] = wasmAssets;
const referencing = files
  .filter((file) => file.endsWith('.js'))
  .filter((file) => readFileSync(join(assetsDir, file), 'utf8').includes(wasmAsset));

if (referencing.length === 0) {
  console.error(`[check-ort-asset] ${wasmAsset} was emitted but no chunk references it by name.`);
  console.error('[check-ort-asset] The runtime would request an unhashed path that is not deployed.');
  process.exit(1);
}

console.log(`[check-ort-asset] ${wasmAsset} referenced by ${referencing.join(', ')}`);
