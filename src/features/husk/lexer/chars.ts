// Character classification for the Husk PowerShell lexer.
//
// Ported from PowerShell (MIT), Copyright (c) Microsoft Corporation:
//   src/System.Management.Automation/engine/parser/CharTraits.cs
// The 128-entry lookup table lives in ./charTraits.ts and is generated;
// these are the predicates layered over it.
//
// Ported deliberately rather than reinvented: PowerShell accepts Unicode
// look-alikes for dashes and quotes, which obfuscators use directly. A
// hand-rolled classifier that only knows ASCII '-' and '"' silently
// mis-tokenises those samples.

import { TRAITS, Trait } from './charTraits';

/** Non-ASCII characters PowerShell treats as syntax. */
export const SpecialChars = {
  // Uncommon whitespace
  NoBreakSpace: ' ',
  NextLine: '\u0085',

  // Special dashes - all accepted where '-' is accepted
  EnDash: '–',
  EmDash: '—',
  HorizontalBar: '―',

  // Special quotes - all accepted as string delimiters
  QuoteSingleLeft: '‘',
  QuoteSingleRight: '’',
  QuoteSingleBase: '‚',
  QuoteReversed: '‛',
  QuoteDoubleLeft: '“',
  QuoteDoubleRight: '”',
  QuoteLowDoubleLeft: '„',
} as const;

const code = (c: string): number => c.charCodeAt(0);

const traitsOf = (c: string): number => {
  const n = code(c);
  return n < 128 ? TRAITS[n] : 0;
};

const has = (c: string, flag: number): boolean => (traitsOf(c) & flag) !== 0;

/** Unicode separator category, for characters at or above 256. */
const isSeparator = (c: string): boolean => /\p{Z}/u.test(c);

const isLetter = (c: string): boolean => /\p{L}/u.test(c);

const isLetterOrDigit = (c: string): boolean => /[\p{L}\p{Nd}]/u.test(c);

/** Whitespace, excluding newlines - PowerShell treats those separately. */
export function isWhitespace(c: string): boolean {
  const n = code(c);
  if (n < 128) return has(c, Trait.Whitespace);
  if (n <= 256) return c === SpecialChars.NoBreakSpace || c === SpecialChars.NextLine;
  return isSeparator(c);
}

export function isNewline(c: string): boolean {
  return has(c, Trait.Newline);
}

/** Any of the ASCII or Unicode dashes. Obfuscators use the Unicode ones. */
export function isDash(c: string): boolean {
  return (
    c === '-' ||
    c === SpecialChars.EnDash ||
    c === SpecialChars.EmDash ||
    c === SpecialChars.HorizontalBar
  );
}

/** Any of the ASCII or Unicode single quotes. */
export function isSingleQuote(c: string): boolean {
  return (
    c === "'" ||
    c === SpecialChars.QuoteSingleLeft ||
    c === SpecialChars.QuoteSingleRight ||
    c === SpecialChars.QuoteSingleBase ||
    c === SpecialChars.QuoteReversed
  );
}

/** Any of the ASCII or Unicode double quotes. */
export function isDoubleQuote(c: string): boolean {
  return (
    c === '"' ||
    c === SpecialChars.QuoteDoubleLeft ||
    c === SpecialChars.QuoteDoubleRight ||
    c === SpecialChars.QuoteLowDoubleLeft
  );
}

/** Valid first character of an unbraced variable name. */
export function isVariableStart(c: string): boolean {
  return code(c) < 128 ? has(c, Trait.VarNameFirst) : isLetterOrDigit(c);
}

export function isIdentifierStart(c: string): boolean {
  return code(c) < 128 ? has(c, Trait.IdentifierStart) : isLetter(c);
}

export function isIdentifierFollow(c: string): boolean {
  return code(c) < 128
    ? has(c, Trait.IdentifierStart | Trait.Digit)
    : isLetterOrDigit(c);
}

export function isHexDigit(c: string): boolean {
  return has(c, Trait.HexDigit);
}

export function isDecimalDigit(c: string): boolean {
  return code(c) - 0x30 <= 9 && code(c) >= 0x30;
}

export function isBinaryDigit(c: string): boolean {
  return c === '0' || c === '1';
}

/** Numeric literal type suffix, e.g. the 'l' in 100l. */
export function isTypeSuffix(c: string): boolean {
  return has(c, Trait.TypeSuffix);
}

/** First character of a numeric multiplier, e.g. the 'k' in 10kb. */
export function isMultiplierStart(c: string): boolean {
  return has(c, Trait.MultiplierStart);
}

export function isCurlyBracket(c: string): boolean {
  return c === '{' || c === '}';
}

/**
 * True if this character ends the current token regardless of lexer mode.
 * This is what makes 'a#b' one token but 'a{' two.
 */
export function forceStartNewToken(c: string): boolean {
  return code(c) < 128 ? has(c, Trait.ForceStartNewToken) : isWhitespace(c);
}

/**
 * True if this character ends a number token, making '7z' one token but
 * '7+' two. Ternary '?' and ':' only end a number in contexts where a
 * ternary operator is possible.
 */
export function forceStartNewTokenAfterNumber(
  c: string,
  forceEndNumberOnTernaryOperatorChars = false,
): boolean {
  if (code(c) < 128) {
    if (has(c, Trait.ForceStartNewTokenAfterNumber)) return true;
    return forceEndNumberOnTernaryOperatorChars && (c === '?' || c === ':');
  }
  return isDash(c);
}

export function forceStartNewTokenInAssemblyNameSpec(c: string): boolean {
  return code(c) < 128
    ? has(c, Trait.ForceStartNewAssemblyNameSpecToken)
    : isWhitespace(c);
}
