import { describe, expect, it } from 'vitest';

import {
  BINARY_PRECEDENCE_MASK,
  DASHED_OPERATORS,
  KEYWORDS,
  TOKEN_FLAGS,
  TOKEN_TEXT,
  TokenFlag,
  TokenKind,
  binaryPrecedence,
  hasFlag,
} from '../tokenKind';

describe('ported token tables', () => {
  it('keeps the flag and text tables aligned', () => {
    expect(TOKEN_FLAGS).toHaveLength(TOKEN_TEXT.length);
  });

  it('indexes the tables by TokenKind value', () => {
    expect(TOKEN_TEXT[TokenKind.LParen]).toBe('(');
    expect(TOKEN_TEXT[TokenKind.RCurly]).toBe('}');
    expect(TOKEN_TEXT[TokenKind.If]).toBe('if');
  });
});

describe('operator precedence', () => {
  // Precedence ordering is the thing most likely to be silently wrong if
  // reconstructed by hand, so assert the relationships rather than the values.
  it('binds multiply tighter than add', () => {
    expect(binaryPrecedence(TokenKind.Multiply)).toBeGreaterThan(
      binaryPrecedence(TokenKind.Plus),
    );
  });

  it('binds add tighter than comparison', () => {
    expect(binaryPrecedence(TokenKind.Plus)).toBeGreaterThan(
      binaryPrecedence(TokenKind.Ieq),
    );
  });

  it('binds comparison tighter than logical', () => {
    expect(binaryPrecedence(TokenKind.Ieq)).toBeGreaterThan(
      binaryPrecedence(TokenKind.And),
    );
  });

  it('binds the format operator tighter than multiply', () => {
    expect(binaryPrecedence(TokenKind.Format)).toBeGreaterThan(
      binaryPrecedence(TokenKind.Multiply),
    );
  });

  it('reports no precedence for non-operators', () => {
    expect(binaryPrecedence(TokenKind.LParen)).toBe(0);
    expect(binaryPrecedence(TokenKind.Identifier)).toBe(0);
  });

  it('fits every precedence inside the mask', () => {
    for (const kind of [TokenKind.And, TokenKind.Plus, TokenKind.Multiply, TokenKind.Format]) {
      expect(binaryPrecedence(kind) & ~BINARY_PRECEDENCE_MASK).toBe(0);
    }
  });
});

describe('keyword lookup', () => {
  it('resolves the keywords obfuscated scripts rely on', () => {
    expect(KEYWORDS.get('if')).toBe(TokenKind.If);
    expect(KEYWORDS.get('foreach')).toBe(TokenKind.Foreach);
    expect(KEYWORDS.get('function')).toBe(TokenKind.Function);
    expect(KEYWORDS.get('while')).toBe(TokenKind.While);
  });

  it('is keyed on lowercase text', () => {
    expect(KEYWORDS.has('IF')).toBe(false);
    expect(KEYWORDS.has('if')).toBe(true);
  });

  it('flags every keyword entry as a keyword', () => {
    for (const kind of KEYWORDS.values()) {
      expect(hasFlag(kind, TokenFlag.Keyword)).toBe(true);
    }
  });
});

describe('dashed operator lookup', () => {
  // These come from tokenizer.cs's own lookup tables, not from token.cs's
  // display-text table: the display text lists only '-ireplace', while the
  // tokenizer also accepts the bare '-replace' that scripts actually use.
  it('resolves the unprefixed comparison operators', () => {
    expect(DASHED_OPERATORS.get('-eq')).toBe(TokenKind.Ieq);
    expect(DASHED_OPERATORS.get('-replace')).toBe(TokenKind.Ireplace);
    expect(DASHED_OPERATORS.get('-split')).toBe(TokenKind.Isplit);
    expect(DASHED_OPERATORS.get('-join')).toBe(TokenKind.Join);
  });

  it('resolves explicit case-insensitive variants to the same kind', () => {
    expect(DASHED_OPERATORS.get('-ireplace')).toBe(TokenKind.Ireplace);
    expect(DASHED_OPERATORS.get('-ieq')).toBe(TokenKind.Ieq);
    expect(DASHED_OPERATORS.get('-imatch')).toBe(TokenKind.Imatch);
  });

  it('resolves case-sensitive variants to distinct kinds', () => {
    expect(DASHED_OPERATORS.get('-creplace')).toBe(TokenKind.Creplace);
    expect(DASHED_OPERATORS.get('-ceq')).toBe(TokenKind.Ceq);
    expect(DASHED_OPERATORS.get('-creplace')).not.toBe(
      DASHED_OPERATORS.get('-ireplace'),
    );
  });

  it('resolves the format operator obfuscators rely on', () => {
    expect(DASHED_OPERATORS.get('-f')).toBe(TokenKind.Format);
  });

  it('carries the leading dash on every key', () => {
    for (const key of DASHED_OPERATORS.keys()) {
      expect(key.startsWith('-')).toBe(true);
      expect(key.length).toBeGreaterThan(1);
    }
  });

  it('never maps empty text', () => {
    expect(DASHED_OPERATORS.has('')).toBe(false);
    expect(DASHED_OPERATORS.has('-')).toBe(false);
    expect(KEYWORDS.has('')).toBe(false);
  });
});

describe('symbolic operators', () => {
  it('keeps display text for operators scanned by character', () => {
    expect(TOKEN_TEXT[TokenKind.Plus]).toBe('+');
    expect(TOKEN_TEXT[TokenKind.Multiply]).toBe('*');
  });
});
