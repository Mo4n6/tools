// Recipe for the character-array encoders.
//
// Invoke-Obfuscation's Ascii/Hex/Octal/Binary/BXOR encoders all share one
// shape: a list of numbers, converted at some radix, optionally XORed, mapped
// through [char], and joined. The surrounding pipeline (`| ForEach-Object { }`)
// needs the phase 2 evaluator, but the transform itself is mechanical, so the
// shape is matched directly.
//
//   (57,72,'2d',...) | %{ [char][convert]::ToInt16([string]$_,16) }
//   '87{114-105...'.split('V,-Ge') | foreach { [int]$_ -as [char] }
//   ([char[]](108,73,...) | % { [char]($_ -bxor "0x3b") }) -join ''

import { looksLikeText } from './decode';

/** How a character-array launcher converts its numbers. */
interface Shape {
  readonly radix: number;
  readonly xorKey?: number;
}

/** Reads the radix from the ToInt16/ToByte/ToChar call that follows. */
function readRadix(source: string): number {
  // [convert]::ToInt16(([string]$_), 16) - the first argument is itself
  // parenthesised, so the pattern has to span one level of nesting.
  const explicit =
    /to(?:int16|int32|int64|byte|uint16|uint32)\s*\((?:[^()]|\([^()]*\))*?,\s*(\d{1,2})\s*\)/i.exec(
      source,
    );
  if (explicit) {
    const radix = Number.parseInt(explicit[1], 10);
    if (radix >= 2 && radix <= 36) return radix;
  }
  return 10;
}

function readXorKey(source: string): number | undefined {
  const match = /-bxor\s*['"]?(0x[0-9a-f]+|\d+)['"]?/i.exec(source);
  if (!match) return undefined;
  const text = match[1];
  return /^0x/i.test(text) ? Number.parseInt(text.slice(2), 16) : Number.parseInt(text, 10);
}

/**
 * Numbers written as a comma list, e.g. (57, 72, '2d', 69).
 * Quoted elements are still numbers - the quoting exists so that hex digits
 * survive PowerShell's own parsing.
 */
function readNumberList(source: string, radix: number): number[] | undefined {
  const match = /\(\s*((?:['"]?[0-9a-fA-F]+['"]?\s*,\s*){6,}['"]?[0-9a-fA-F]+['"]?)\s*\)/.exec(source);
  if (!match) return undefined;

  const values: number[] = [];
  for (const raw of match[1].split(',')) {
    const cleaned = raw.trim().replace(/^['"]|['"]$/g, '');
    if (cleaned === '') continue;
    const value = Number.parseInt(cleaned, radix);
    if (Number.isNaN(value)) return undefined;
    values.push(value);
  }
  return values.length >= 6 ? values : undefined;
}

/**
 * Numbers packed into one string and separated by junk characters, e.g.
 * '87{114-105e116'.split('V,-GePf{:!') or a chain of -split operators.
 */
function readSplitString(source: string, radix: number): number[] | undefined {
  const literal = /['"]([0-9a-fA-F][0-9a-fA-F<>{}%$#@!|:;,.\-_=+*~^&\/\\A-Za-z]{20,})['"]/.exec(source);
  if (!literal) return undefined;

  const packed = literal[1];
  const delimiters = new Set<string>();

  // .split('abc') is the .NET method: case-sensitive, delimiters listed as
  // one string of characters.
  for (const m of source.matchAll(/\.split\s*\(\s*['"]([^'"]+)['"]/gi)) {
    for (const c of m[1]) delimiters.add(c);
  }

  // -split 'x' is the PowerShell operator, and it is CASE-INSENSITIVE by
  // default. Obfuscators exploit that: a chain declaring -Split'A' also
  // splits on every lowercase 'a' in the payload. Adding only the declared
  // case leaves those joined, and parseInt then truncates at them - losing
  // characters from the decoded script rather than failing outright.
  for (const m of source.matchAll(/-split\s*['"]([^'"]{1,4})['"]/gi)) {
    for (const c of m[1]) {
      delimiters.add(c.toLowerCase());
      delimiters.add(c.toUpperCase());
    }
  }
  if (delimiters.size === 0) return undefined;

  const pattern = new RegExp(`[${[...delimiters].map(escapeForClass).join('')}]`);
  const values: number[] = [];
  for (const part of packed.split(pattern)) {
    if (part === '') continue;
    const value = Number.parseInt(part, radix);
    if (Number.isNaN(value)) return undefined;
    values.push(value);
  }
  return values.length >= 6 ? values : undefined;
}

/** Recover the script a character-array launcher would build, if it is one. */
export function decodeCharArray(source: string): string | undefined {
  // The shape always maps to characters somewhere.
  if (!/\[\s*char/i.test(source) && !/-as\s*\[\s*char/i.test(source)) return undefined;

  const shape: Shape = { radix: readRadix(source), xorKey: readXorKey(source) };

  const values =
    readNumberList(source, shape.radix) ??
    readSplitString(source, shape.radix) ??
    // Binary launchers write long runs of 0s and 1s, which the generic
    // readers miss because they look like ordinary decimal.
    readBinaryString(source);
  if (!values) return undefined;

  const text = values
    .map((v) => String.fromCharCode(shape.xorKey === undefined ? v : v ^ shape.xorKey))
    .join('');

  return looksLikeText(text) ? text : undefined;
}

/**
 * Escape a character for use inside a regex character class.
 *
 * Only the four characters that are special there need escaping. Escaping
 * everything is actively wrong: `\f` is a form feed and `\e` is not a valid
 * escape, so blanket-escaping silently drops those delimiters and parseInt
 * then truncates at them, losing characters from the decoded script.
 */
function escapeForClass(c: string): string {
  return /[\]\\^-]/.test(c) ? `\\${c}` : c;
}

/** A packed run of binary digits split by junk characters. */
function readBinaryString(source: string): number[] | undefined {
  const literal = /['"]([01][01\W_a-zA-Z]{40,})['"]/.exec(source);
  if (!literal) return undefined;

  const parts = literal[1].split(/[^01]+/).filter((p) => p.length >= 6);
  if (parts.length < 6) return undefined;

  const values = parts.map((p) => Number.parseInt(p, 2));
  return values.some(Number.isNaN) ? undefined : values;
}
