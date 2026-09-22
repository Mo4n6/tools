#!/usr/bin/env node
/**
 * SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
 * Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
 *
 * Walks the runtime dependency tree reachable from "dependencies" in
 * package.json and tallies the licence of every package in it.
 *
 * THIRD-PARTY.md asks for its tally to be regenerated rather than hand-edited.
 * This is what regenerates it:
 *
 *   node scripts/license-tally.mjs            # markdown table, for THIRD-PARTY.md
 *   node scripts/license-tally.mjs --json     # the same data, machine-readable
 *
 * Only runtime dependencies are walked. devDependencies do not ship, so their
 * terms do not reach anyone who receives a build.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Resolve a package by walking node_modules upward from `fromDir`, the way
 * Node itself resolves. Hoisting means a nested dependency usually lives at
 * the tree root, but not always.
 */
const resolvePackageDir = (name, fromDir) => {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

/** npm allows a string, a deprecated {type}, or a deprecated licenses[]. */
const licenseOf = (pkg) => {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type;
  if (Array.isArray(pkg.licenses)) {
    const types = pkg.licenses.map((l) => l?.type).filter(Boolean);
    if (types.length === 1) return types[0];
    if (types.length > 1) return `(${types.join(' OR ')})`;
  }
  return 'UNKNOWN';
};

const root = readJson(join(repoRoot, 'package.json'));
const seen = new Map();
const missing = new Set();
const queue = Object.keys(root.dependencies ?? {}).map((name) => [name, repoRoot]);

while (queue.length > 0) {
  const [name, fromDir] = queue.shift();
  if (seen.has(name)) continue;

  const dir = resolvePackageDir(name, fromDir);
  if (dir === null) {
    missing.add(name);
    continue;
  }

  const pkg = readJson(join(dir, 'package.json'));
  seen.set(name, licenseOf(pkg));

  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (!seen.has(dep)) queue.push([dep, dir]);
  }
  // Optional dependencies ship when the platform matches, so they count too.
  for (const dep of Object.keys(pkg.optionalDependencies ?? {})) {
    if (!seen.has(dep)) queue.push([dep, dir]);
  }
}

const byLicense = new Map();
for (const [name, license] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
  if (!byLicense.has(license)) byLicense.set(license, []);
  byLicense.get(license).push(name);
}

const ordered = [...byLicense].sort(
  ([aLicense, a], [bLicense, b]) => b.length - a.length || aLicense.localeCompare(bLicense),
);

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      {
        totalPackages: seen.size,
        unresolved: [...missing].sort(),
        licenses: Object.fromEntries(ordered),
      },
      null,
      2,
    ),
  );
} else {
  console.log('| Licence | Packages | Examples |');
  console.log('|---|---|---|');
  for (const [license, names] of ordered) {
    const shown = names.slice(0, 6);
    const examples =
      names.length > shown.length
        ? `${shown.join(', ')}, and ${names.length - shown.length} more`
        : shown.join(', ');
    console.log(`| ${license} | ${names.length} | ${examples} |`);
  }
  console.log(`\nTotal: ${seen.size} runtime packages.`);
  if (missing.size > 0) {
    console.log(`\nUnresolved (not installed): ${[...missing].sort().join(', ')}`);
  }
}
