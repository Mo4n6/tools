// Regenerates src/features/husk/lexer/tokenKind.ts from the MIT-licensed
// PowerShell source file token.cs.
//
// Three parallel tables are transcribed: the TokenKind enum, the TokenFlags
// enum (which carries operator precedence), and the per-kind flag and text
// tables. Getting operator precedence subtly wrong produces an evaluator that
// computes the wrong answer without erroring, so this is ported mechanically
// rather than reconstructed from the language specification.
//
// Usage:
//   node scripts/port-tokens.mjs <path-to-PowerShell-checkout>
//
// Source: https://github.com/PowerShell/PowerShell (MIT)
//   src/System.Management.Automation/engine/parser/token.cs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REL_SOURCE = 'src/System.Management.Automation/engine/parser/token.cs';
const REL_TOKENIZER = 'src/System.Management.Automation/engine/parser/tokenizer.cs';
const OUT = 'src/features/husk/lexer/tokenKind.ts';

const checkout = process.argv[2];
if (!checkout) {
  console.error('usage: node scripts/port-tokens.mjs <path-to-PowerShell-checkout>');
  process.exit(1);
}

const source = readFileSync(join(checkout, REL_SOURCE), 'utf8');
const tokenizerSource = readFileSync(join(checkout, REL_TOKENIZER), 'utf8');

// Strip comments so enum members inside doc comments are not picked up.
const stripComments = (text) =>
  text.replace(/\/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

function extractBlock(pattern, label) {
  const match = source.match(pattern);
  if (!match) throw new Error(`could not locate ${label}`);
  return match[1];
}

// --- TokenKind: sequential, explicitly numbered ---------------------------
const kindBody = stripComments(
  extractBlock(/public enum TokenKind\s*\{([\s\S]*?)\n\s{4}\}/, 'the TokenKind enum'),
);
const kinds = [...kindBody.matchAll(/^\s*(\w+)\s*=\s*(\d+)\s*,/gm)].map(([, name, value]) => ({
  name,
  value: Number(value),
}));
if (kinds.length === 0) throw new Error('parsed no TokenKind members');

// The enum is sparse: it carries reserved gaps that the parallel tables fill
// with placeholder rows. Index by numeric value, not by position.
const maxKind = Math.max(...kinds.map((k) => k.value));
const kindAt = new Array(maxKind + 1).fill(null);
for (const k of kinds) {
  if (kindAt[k.value] !== null) throw new Error(`duplicate TokenKind value ${k.value}`);
  kindAt[k.value] = k.name;
}
const TABLE_ROWS = maxKind + 1;

// --- TokenFlags: bit flags, including operator precedence ------------------
const flagBody = stripComments(
  extractBlock(/public enum TokenFlags\s*\{([\s\S]*?)\n\s{4}\}/, 'the TokenFlags enum'),
);
const flags = [...flagBody.matchAll(/^\s*(\w+)\s*=\s*(0x[0-9a-fA-F]+)\s*,/gm)].map(
  ([, name, value]) => ({ name, value: Number.parseInt(value, 16) }),
);
if (flags.length === 0) throw new Error('parsed no TokenFlags members');
const flagByName = new Map(flags.map((f) => [f.name, f.value]));

// --- Parallel tables, one row per TokenKind -------------------------------
const normalizeLabel = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function parseTable(pattern, label, parseRow) {
  const body = extractBlock(pattern, label);
  const rows = [];
  for (const line of body.split('\n')) {
    const row = line.match(/\/\*(.*?)\*\/\s*(.+?),\s*$/);
    if (!row) continue;
    rows.push({ label: row[1].trim(), value: parseRow(row[2].trim()) });
  }
  if (rows.length !== TABLE_ROWS) {
    throw new Error(`${label}: expected ${TABLE_ROWS} rows, parsed ${rows.length}`);
  }
  // Rows aligned to a real token kind must carry that kind's name; rows over a
  // reserved gap must not. This is what catches a table drifting out of step.
  rows.forEach((r, i) => {
    const expected = kindAt[i];
    if (expected === null) {
      if (!/^Reserved slot/i.test(r.label)) {
        throw new Error(`${label}: row ${i} is '${r.label}', expected a reserved slot`);
      }
    } else if (normalizeLabel(r.label) !== normalizeLabel(expected)) {
      // Labels are comments, so they drift from the enum spelling: the source
      // has 'Newline' against a 'NewLine' member and '<dynamic keyword>'
      // against 'DynamicKeyword'. Compare on alphanumerics only, which still
      // catches a table genuinely out of step with the enum.
      throw new Error(`${label}: row ${i} is '${r.label}', expected '${expected}'`);
    }
  });
  return rows;
}

const flagRows = parseTable(
  /private static readonly TokenFlags\[\] s_staticTokenFlags = new TokenFlags\[\]\s*\{([\s\S]*?)\n\s*\};/,
  'the s_staticTokenFlags table',
  (expr) => {
    let mask = 0;
    for (const [, name] of expr.matchAll(/TokenFlags\.(\w+)/g)) {
      if (!flagByName.has(name)) throw new Error(`unknown TokenFlags member: ${name}`);
      mask |= flagByName.get(name);
    }
    return mask;
  },
);

const textRows = parseTable(
  /private static readonly string\[\] s_tokenText = new string\[\]\s*\{([\s\S]*?)\n\s*\};/,
  'the s_tokenText table',
  (expr) => {
    if (expr === 'string.Empty') return '';
    const literal = expr.match(/^"((?:[^"\\]|\\.)*)"$/);
    if (!literal) throw new Error(`could not parse token text literal: ${expr}`);
    return JSON.parse(`"${literal[1]}"`);
  },
);

// --- Lookup tables from tokenizer.cs --------------------------------------
// token.cs's s_tokenText holds *display* text, not lookup keys: it lists
// '-ireplace' for Ireplace, while the tokenizer accepts a bare '-replace' too.
// The authoritative mapping is the paired text/kind arrays in tokenizer.cs.
const kindByName = new Map(kinds.map((k) => [k.name, k.value]));

function extractPairedTables(textName, kindName, label) {
  const textBlock = tokenizerSource.match(
    new RegExp(`${textName} = new string\\[\\] \\{([\\s\\S]*?)\\n\\s*\\};`),
  );
  const kindBlock = tokenizerSource.match(
    new RegExp(`${kindName} = new TokenKind\\[\\] \\{([\\s\\S]*?)\\n\\s*\\};`),
  );
  if (!textBlock || !kindBlock) throw new Error(`could not locate ${label}`);

  // Row markers like /*1*/ and /*A*/ bracket each line; strip them first.
  const stripMarkers = (body) => body.replace(/\/\*[^*]*\*\//g, ' ');

  const texts = [...stripMarkers(textBlock[1]).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
    JSON.parse(`"${m[1]}"`),
  );
  const kindNames = [...stripMarkers(kindBlock[1]).matchAll(/TokenKind\.(\w+)/g)].map((m) => m[1]);

  if (texts.length !== kindNames.length) {
    throw new Error(`${label}: ${texts.length} texts against ${kindNames.length} kinds`);
  }
  if (texts.length === 0) throw new Error(`${label}: parsed no entries`);

  return texts.map((text, i) => {
    const name = kindNames[i];
    if (!kindByName.has(name)) throw new Error(`${label}: unknown TokenKind ${name}`);
    if (text === '') throw new Error(`${label}: empty lookup key at index ${i}`);
    return [text, kindByName.get(name)];
  });
}

const keywordPairs = extractPairedTables(
  's_keywordText',
  's_keywordTokenKind',
  'the keyword lookup tables',
);

// Operator keys are stored without the leading dash; the tokenizer strips it
// before looking the operator up. Restore it so callers can match source text.
const operatorPairs = extractPairedTables(
  '_operatorText',
  's_operatorTokenKind',
  'the operator lookup tables',
).map(([text, kind]) => [`-${text}`, kind]);

const hex = (n) => `0x${n.toString(16).padStart(8, '0')}`;
const kindWidth = Math.max(...kinds.map((k) => k.name.length));
const rowLabel = (i) => (kindAt[i] ?? `reserved ${i}`).padEnd(kindWidth);

const generated = `// GENERATED FILE - do not edit by hand.
// Regenerate with: node scripts/port-tokens.mjs <path-to-PowerShell-checkout>
//
// Ported from PowerShell (MIT), Copyright (c) Microsoft Corporation:
//   ${REL_SOURCE}
// See docs/licenses/husk-manifest.json for the attribution record.

/** Every token kind the PowerShell tokenizer can produce. */
export enum TokenKind {
${kinds.map((k) => `  ${k.name} = ${k.value},`).join('\n')}
}

/**
 * Token trait flags. The BinaryPrecedence* values carry operator precedence
 * and are consumed by the parser's precedence climbing.
 */
export const TokenFlag = {
${flags.map((f) => `  ${f.name}: ${hex(f.value)},`).join('\n')}
} as const;

export type TokenFlag = (typeof TokenFlag)[keyof typeof TokenFlag];

/** Mask isolating the binary-operator precedence bits. */
export const BINARY_PRECEDENCE_MASK = TokenFlag.BinaryPrecedenceMask;

/** Static flags per token kind, indexed by TokenKind. */
export const TOKEN_FLAGS: readonly number[] = [
${flagRows.map((r, i) => `  /* ${rowLabel(i)} */ ${hex(r.value)},`).join('\n')}
];

/** Display text per token kind, indexed by TokenKind. */
export const TOKEN_TEXT: readonly string[] = [
${textRows.map((r, i) => `  /* ${rowLabel(i)} */ ${JSON.stringify(r.value)},`).join('\n')}
];

/** Binary-operator precedence for a token kind, or 0 if it is not one. */
export function binaryPrecedence(kind: TokenKind): number {
  return TOKEN_FLAGS[kind] & BINARY_PRECEDENCE_MASK;
}

export function hasFlag(kind: TokenKind, flag: number): boolean {
  return (TOKEN_FLAGS[kind] & flag) !== 0;
}

/** Keyword text to token kind. Keys are lowercase; lookup is case-insensitive. */
export const KEYWORDS: ReadonlyMap<string, TokenKind> = new Map(
  ${JSON.stringify(keywordPairs)} as [string, TokenKind][],
);

/**
 * Dashed operator text to token kind, including every case-sensitivity
 * variant. Keys carry the leading dash, e.g. '-replace' and '-ireplace' both
 * resolve to Ireplace.
 */
export const DASHED_OPERATORS: ReadonlyMap<string, TokenKind> = new Map(
  ${JSON.stringify(operatorPairs)} as [string, TokenKind][],
);
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, generated);
console.log(
  `wrote ${OUT} (${kinds.length} token kinds, ${flags.length} flags, ` +
    `${keywordPairs.length} keywords, ${operatorPairs.length} operators)`,
);
