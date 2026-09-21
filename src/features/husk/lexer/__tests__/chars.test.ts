import { describe, expect, it } from 'vitest';

import { TRAITS, Trait } from '../charTraits';
import {
  SpecialChars,
  forceStartNewToken,
  forceStartNewTokenAfterNumber,
  isDash,
  isDecimalDigit,
  isDoubleQuote,
  isHexDigit,
  isIdentifierFollow,
  isIdentifierStart,
  isSingleQuote,
  isVariableStart,
  isWhitespace,
} from '../chars';

describe('ported trait table', () => {
  it('covers exactly the ASCII range', () => {
    expect(TRAITS).toHaveLength(128);
  });

  it('classifies digits as both decimal and hex', () => {
    for (const d of '0123456789') {
      expect(TRAITS[d.charCodeAt(0)] & Trait.Digit).toBeTruthy();
      expect(TRAITS[d.charCodeAt(0)] & Trait.HexDigit).toBeTruthy();
    }
  });

  it('marks a-f and A-F as hex digits but not g', () => {
    for (const c of 'abcdefABCDEF') expect(isHexDigit(c)).toBe(true);
    expect(isHexDigit('g')).toBe(false);
  });
});

describe('identifiers and variables', () => {
  it('accepts letters and underscore as identifier starts', () => {
    for (const c of 'azAZ_') expect(isIdentifierStart(c)).toBe(true);
  });

  it('rejects digits as identifier starts but accepts them as follows', () => {
    expect(isIdentifierStart('7')).toBe(false);
    expect(isIdentifierFollow('7')).toBe(true);
  });

  it('accepts non-ASCII letters as identifier starts', () => {
    expect(isIdentifierStart('é')).toBe(true);
    expect(isIdentifierStart('日')).toBe(true);
  });

  it('treats $ as a variable-name start', () => {
    expect(isVariableStart('$')).toBe(true);
  });
});

// The Unicode look-alikes below are the reason these predicates are ported
// rather than hand-rolled: PowerShell accepts them as real syntax, and
// obfuscators use them precisely because naive ASCII-only tokenisers do not.
describe('Unicode look-alike syntax', () => {
  it('accepts special dashes wherever - is accepted', () => {
    expect(isDash('-')).toBe(true);
    expect(isDash(SpecialChars.EnDash)).toBe(true);
    expect(isDash(SpecialChars.EmDash)).toBe(true);
    expect(isDash(SpecialChars.HorizontalBar)).toBe(true);
    expect(isDash('_')).toBe(false);
  });

  it('accepts smart quotes as string delimiters', () => {
    expect(isSingleQuote("'")).toBe(true);
    expect(isSingleQuote(SpecialChars.QuoteSingleLeft)).toBe(true);
    expect(isSingleQuote(SpecialChars.QuoteSingleRight)).toBe(true);
    expect(isDoubleQuote('"')).toBe(true);
    expect(isDoubleQuote(SpecialChars.QuoteDoubleLeft)).toBe(true);
    expect(isDoubleQuote(SpecialChars.QuoteLowDoubleLeft)).toBe(true);
  });

  it('treats no-break space and next-line as whitespace', () => {
    expect(isWhitespace(SpecialChars.NoBreakSpace)).toBe(true);
    expect(isWhitespace(SpecialChars.NextLine)).toBe(true);
  });

  it('does not treat newlines as whitespace', () => {
    expect(isWhitespace('\n')).toBe(false);
    expect(isWhitespace('\r')).toBe(false);
    expect(isWhitespace(' ')).toBe(true);
    expect(isWhitespace('\t')).toBe(true);
  });
});

describe('token boundary rules', () => {
  // The behaviour the source comments call out explicitly: 'a#b' is one token
  // but 'a{' is two.
  it('does not break a token on #', () => {
    expect(forceStartNewToken('#')).toBe(false);
  });

  it('breaks a token on curly brackets', () => {
    expect(forceStartNewToken('{')).toBe(true);
    expect(forceStartNewToken('}')).toBe(true);
  });

  // And for numbers: '7z' is one token, '7+' is two.
  it('does not end a number on a letter', () => {
    expect(forceStartNewTokenAfterNumber('z')).toBe(false);
  });

  it('ends a number on an operator character', () => {
    expect(forceStartNewTokenAfterNumber('+')).toBe(true);
  });

  it('only ends a number on ternary characters when asked', () => {
    expect(forceStartNewTokenAfterNumber('?')).toBe(false);
    expect(forceStartNewTokenAfterNumber('?', true)).toBe(true);
    expect(forceStartNewTokenAfterNumber(':', true)).toBe(true);
  });
});

describe('decimal digits', () => {
  it('accepts only ASCII 0-9', () => {
    for (const d of '0123456789') expect(isDecimalDigit(d)).toBe(true);
    expect(isDecimalDigit('/')).toBe(false);
    expect(isDecimalDigit(':')).toBe(false);
    expect(isDecimalDigit('٣')).toBe(false);
  });
});
