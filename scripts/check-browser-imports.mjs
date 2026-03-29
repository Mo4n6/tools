import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, 'src');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const RUNTIME_EXCLUDE_PATTERNS = [
  /\.test\.[cm]?[jt]sx?$/,
  /\.node\.[jt]sx?$/,
  /\.d\.ts$/,
];

const EXPLICIT_INCLUDE = [
  'src/App.tsx',
  'src/features/ingest',
  'src/features/preview',
];

const NODE_BUILTINS = new Set([
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'readline',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
]);

const BANNED_PACKAGES = new Set([
  'jsdom',
]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    const extension = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(extension)) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function shouldCheck(filePath) {
  const normalized = filePath.split(path.sep).join('/');
  if (!normalized.startsWith('src/')) {
    return false;
  }

  if (RUNTIME_EXCLUDE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return true;
}

function extractImportSpecifiers(content) {
  const regex = /(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?['"]([^'"\n]+)['"]|import\(\s*['"]([^'"\n]+)['"]\s*\)/g;
  const matches = [];
  for (const match of content.matchAll(regex)) {
    const specifier = match[1] ?? match[2];
    if (!specifier) {
      continue;
    }

    const index = match.index ?? 0;
    matches.push({ specifier, index });
  }

  return matches;
}

function lineNumberAt(content, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

function isNodeOnlySpecifier(specifier) {
  if (specifier.startsWith('node:')) {
    return true;
  }

  if (BANNED_PACKAGES.has(specifier)) {
    return true;
  }

  if (NODE_BUILTINS.has(specifier)) {
    return true;
  }

  return false;
}

const allSrcFiles = walk(srcRoot)
  .map((absolutePath) => path.relative(repoRoot, absolutePath))
  .filter((relativePath) => shouldCheck(relativePath));

const violations = [];
for (const filePath of allSrcFiles) {
  const content = fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
  const imports = extractImportSpecifiers(content);

  for (const entry of imports) {
    if (!isNodeOnlySpecifier(entry.specifier)) {
      continue;
    }

    violations.push({
      filePath,
      line: lineNumberAt(content, entry.index),
      specifier: entry.specifier,
    });
  }
}

if (violations.length > 0) {
  console.error('❌ Browser runtime files import Node-only packages.');
  console.error('Fix these imports in browser-entry modules under src/.');
  for (const violation of violations) {
    console.error(`  - ${violation.filePath}:${violation.line} imports "${violation.specifier}"`);
  }
  process.exit(1);
}

const includeList = EXPLICIT_INCLUDE.join(', ');
console.log(`✅ Browser import guard passed for ${allSrcFiles.length} runtime files (${includeList}).`);
