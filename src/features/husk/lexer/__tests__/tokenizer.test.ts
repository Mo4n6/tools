import { describe, expect, it } from 'vitest';

import { TokenKind } from '../tokenKind';
import { tokenize } from '../tokenizer';

// The oracle tests cover token *kinds*. These cover what the oracle cannot:
// decoded values, offsets, diagnostics, and the guarantee that tokenizing
// hostile input always terminates.

const kinds = (source: string): string[] =>
  tokenize(source)
    .tokens.map((t) => TokenKind[t.kind])
    .filter((k) => k !== 'EndOfInput');

const valueOf = (source: string): string | number | undefined =>
  tokenize(source).tokens[0]?.value;

describe('decoded string values', () => {
  it('resolves doubled quotes in a literal string', () => {
    expect(valueOf("'it''s'")).toBe("it's");
  });

  it('resolves backtick escapes in an expandable string', () => {
    expect(valueOf('"a`tb`nc"')).toBe('a\tb\nc');
  });

  it('resolves a doubled quote in an expandable string', () => {
    expect(valueOf('"say ""hi"""')).toBe('say "hi"');
  });

  it('leaves an unknown escape as the literal character', () => {
    expect(valueOf('"a`qb"')).toBe('aqb');
  });

  it('keeps a subexpression intact rather than ending the string at its quote', () => {
    expect(valueOf('"x $("a" + "b") y"')).toBe('x $("a" + "b") y');
  });

  it('reads here-string contents without the delimiters', () => {
    expect(valueOf("@'\nline one\nline two\n'@")).toBe('line one\nline two');
  });
});

describe('numeric values', () => {
  it.each([
    ['42', 42],
    ['0x1F', 31],
    ['0b1011', 11],
    ['1kb', 1024],
    ['2mb', 2 * 1024 * 1024],
    ['1e3', 1000],
    ['100L', 100],
    ['3.5', 3.5],
  ])('parses %s', (source, expected) => {
    expect(valueOf(source)).toBe(expected);
  });
});

describe('offsets', () => {
  it('slices back to each token exactly', () => {
    const source = '$a = [System.Convert]::ToBase64String($b) # note';
    for (const token of tokenize(source).tokens) {
      if (token.kind === TokenKind.EndOfInput) continue;
      expect(source.slice(token.start, token.end)).toBe(token.text);
    }
  });

  it('produces non-overlapping tokens in order', () => {
    const source = "Write-Host ('a' + 'b') -Foo 1";
    let previousEnd = 0;
    for (const token of tokenize(source).tokens) {
      expect(token.start).toBeGreaterThanOrEqual(previousEnd);
      previousEnd = token.end;
    }
  });
});

describe('diagnostics rather than exceptions', () => {
  // Commitment 2 in the spec: tokenizing never aborts. A malformed sample
  // still has to yield everything up to the problem.
  it.each([
    ['unterminated literal string', "'abc"],
    ['unterminated expandable string', '"abc'],
    ['unterminated here-string', "@'\nabc"],
    ['unterminated block comment', '<# abc'],
    ['bare dollar', '$'],
    ['unterminated braced variable', '${abc'],
  ])('records %s without throwing', (_label, source) => {
    const result = tokenize(source);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.tokens.length).toBeGreaterThan(0);
  });

  it('is clean on well-formed input', () => {
    expect(tokenize('Write-Host "ok"').diagnostics).toHaveLength(0);
  });
});

describe('termination on hostile input', () => {
  // Anti-analysis samples must not be able to hang the worker.
  it.each([
    ['empty', ''],
    ['whitespace only', '   \n\t  '],
    ['lone backtick', '`'],
    ['unmatched brackets', '((([[[{{{'],
    ['nul bytes', '\u0000\u0000'],
    ['lone unicode dash', '—'],
    ['deep nesting', '('.repeat(500) + ')'.repeat(500)],
    ['long bareword', 'a'.repeat(20000)],
  ])('terminates on %s', (_label, source) => {
    const started = Date.now();
    const result = tokenize(source);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.tokens.length).toBeGreaterThan(0);
  });

  it('always advances, so no input can stall the scanner', () => {
    // Every byte value, including ones with no token rule at all.
    const source = Array.from({ length: 256 }, (_, i) => String.fromCharCode(i)).join('');
    expect(() => tokenize(source)).not.toThrow();
  });
});

describe('constructs obfuscators rely on', () => {
  it('keeps a backtick-broken command name as one token', () => {
    expect(kinds('Wri`te-Ho`st "x"')).toEqual(['Generic', 'StringExpandable']);
  });

  // A bare argument of plain identifier characters is an Identifier; only one
  // carrying dashes, dots or path separators becomes Generic.
  it('treats a Unicode en-dash as a parameter dash', () => {
    expect(kinds('Get-Thing –Name value')).toEqual(['Generic', 'Parameter', 'Identifier']);
  });

  it('reads the format operator', () => {
    expect(kinds("'{0}' -f 'a'")).toEqual(['StringLiteral', 'Format', 'StringLiteral']);
  });

  it('indexes a variable rather than reading a type literal', () => {
    expect(kinds('$ShellId[1]')).toEqual(['Variable', 'LBracket', 'Number', 'RBracket']);
  });

  it('reads a type literal followed by a number', () => {
    expect(kinds('[char]34')).toEqual(['LBracket', 'Identifier', 'RBracket', 'Number']);
  });

  it('keeps member access after a parenthesised command', () => {
    expect(kinds("(Get-Variable 'x').Name")).toEqual([
      'LParen', 'Generic', 'StringLiteral', 'RParen', 'Dot', 'Identifier',
    ]);
  });

  it('keeps parameters after an invoked callee expression', () => {
    expect(kinds("&('Write-' + 'Output') -InputObject 1")).toEqual([
      'Ampersand', 'LParen', 'StringLiteral', 'Plus', 'StringLiteral', 'RParen',
      'Parameter', 'Number',
    ]);
  });
});
