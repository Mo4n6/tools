// Regenerates src/features/husk/lexer/charTraits.ts from the MIT-licensed
// PowerShell source file CharTraits.cs.
//
// The 128-entry trait table is transcribed mechanically rather than by hand:
// a single wrong flag produces a lexer that is subtly wrong on one character,
// which is exactly the class of bug that is expensive to find later.
//
// Usage:
//   node scripts/port-char-traits.mjs <path-to-PowerShell-checkout>
//
// Source: https://github.com/PowerShell/PowerShell (MIT)
//   src/System.Management.Automation/engine/parser/CharTraits.cs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REL_SOURCE = 'src/System.Management.Automation/engine/parser/CharTraits.cs';
const OUT = 'src/features/husk/lexer/charTraits.ts';

const checkout = process.argv[2];
if (!checkout) {
  console.error('usage: node scripts/port-char-traits.mjs <path-to-PowerShell-checkout>');
  process.exit(1);
}

const source = readFileSync(join(checkout, REL_SOURCE), 'utf8');

// Pull the flag enum so the TS constants cannot drift from the C# values.
const enumBody = source.match(/enum CharTraits\s*\{([\s\S]*?)\n\s{4}\}/);
if (!enumBody) throw new Error('could not locate the CharTraits enum');

const flags = [...enumBody[1].matchAll(/^\s*(\w+)\s*=\s*(0x[0-9a-fA-F]+)\s*,/gm)].map(
  ([, name, value]) => ({ name, value: Number.parseInt(value, 16) }),
);
if (flags.length === 0) throw new Error('could not parse any CharTraits flags');

// Pull the 128-entry table.
const tableBody = source.match(
  /private static readonly CharTraits\[\] s_traits = new CharTraits\[\]\s*\{([\s\S]*?)\n\s*\};/,
);
if (!tableBody) throw new Error('could not locate the s_traits table');

const byName = new Map(flags.map((f) => [f.name, f.value]));
const entries = [];

for (const line of tableBody[1].split('\n')) {
  // Each row looks like:  /*        z */ CharTraits.IdentifierStart | CharTraits.VarNameFirst,
  const row = line.match(/\/\*(.*?)\*\/\s*(.+?),\s*$/);
  if (!row) continue;

  const label = row[1].trim();
  let mask = 0;
  for (const [, flag] of row[2].matchAll(/CharTraits\.(\w+)/g)) {
    if (!byName.has(flag)) throw new Error(`unknown CharTraits flag: ${flag}`);
    mask |= byName.get(flag);
  }
  entries.push({ label, mask });
}

if (entries.length !== 128) {
  throw new Error(`expected 128 table entries, parsed ${entries.length}`);
}

const pad = (n) => `0x${n.toString(16).padStart(4, '0')}`;
const width = Math.max(...entries.map((e) => e.label.length));

const generated = `// GENERATED FILE - do not edit by hand.
// Regenerate with: node scripts/port-char-traits.mjs <path-to-PowerShell-checkout>
//
// Ported from PowerShell (MIT), Copyright (c) Microsoft Corporation:
//   ${REL_SOURCE}
// See docs/licenses/husk-manifest.json for the attribution record.

/** Character trait flags, mirroring the CharTraits enum in the source above. */
export const Trait = {
${flags.map((f) => `  ${f.name}: ${pad(f.value)},`).join('\n')}
} as const;

export type Trait = (typeof Trait)[keyof typeof Trait];

/**
 * Traits for code points 0x00-0x7F. Characters at or above 128 are classified
 * by the predicates below rather than by this table.
 */
export const TRAITS: readonly number[] = [
${entries.map((e) => `  /* ${e.label.padEnd(width)} */ ${pad(e.mask)},`).join('\n')}
];
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, generated);
console.log(`wrote ${OUT} (${entries.length} entries, ${flags.length} flags)`);
