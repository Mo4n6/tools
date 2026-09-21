import { describe, expect, it } from 'vitest';

import {
  corpus,
  edgeCases,
  fixtures,
  fixturesByTransform,
  lexableCases,
  lexerOracle,
  transforms,
} from '..';

// These tests guard the corpus itself. They do not test Husk - nothing is
// implemented yet - they ensure the ground truth stays trustworthy, because
// everything downstream is measured against it.

describe('corpus integrity', () => {
  // A floor, not an exact count: regenerating against a newer Invoke-
  // Obfuscation may add variants. It should never lose most of them.
  it('has fixtures across many transforms', () => {
    expect(fixtures.length).toBeGreaterThan(200);
    expect(transforms().length).toBeGreaterThan(15);
  });

  it('gives every fixture a unique id', () => {
    const ids = fixtures.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every fixture non-empty obfuscated text and an expectation', () => {
    for (const f of fixtures) {
      expect(f.obfuscated.length, f.id).toBeGreaterThan(0);
      expect(f.expected.length, f.id).toBeGreaterThan(0);
    }
  });

  it('ties every fixture to a declared payload', () => {
    for (const f of fixtures) {
      expect(corpus.payloads[f.payload], f.id).toBe(f.expected);
    }
  });

  // If a transform were a no-op, a deobfuscator that did nothing would pass
  // on it and inflate the coverage number.
  it('actually obfuscates - no fixture equals its own plaintext', () => {
    for (const f of fixtures) {
      expect(f.obfuscated.trim(), f.id).not.toBe(f.expected.trim());
    }
  });

  it('keeps payloads benign, since fixtures are committed to the repo', () => {
    for (const payload of Object.values(corpus.payloads)) {
      expect(payload).not.toMatch(/DownloadString|DownloadFile|Invoke-WebRequest|Start-Process/i);
    }
  });
});

describe('transform coverage', () => {
  // The transform families commodity droppers actually use. If Invoke-
  // Obfuscation stops emitting one, we want a failing test, not a silently
  // smaller corpus.
  it.each([
    'Out-CompressedCommand',
    'Out-EncodedAsciiCommand',
    'Out-EncodedHexCommand',
    'Out-SecureStringCommand',
    'Out-ObfuscatedStringCommand',
    'Out-ObfuscatedTokenCommand/String',
    'Out-ObfuscatedTokenCommand/Command',
    'Out-ObfuscatedTokenCommand/Variable',
  ])('covers %s', (transform) => {
    expect(fixturesByTransform(transform).length).toBeGreaterThan(0);
  });
});

describe('lexer oracle integrity', () => {
  it('records the PowerShell build that produced it', () => {
    expect(lexerOracle.powerShellVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('covers the corpus plus targeted edge cases', () => {
    expect(lexerOracle.cases.length).toBeGreaterThanOrEqual(fixtures.length);
    expect(edgeCases().length).toBeGreaterThan(20);
  });

  it('gives every case a unique id', () => {
    const ids = lexerOracle.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produces tokens for every lexable case', () => {
    for (const c of lexableCases()) {
      expect(c.tokens.length, c.id).toBeGreaterThan(0);
    }
  });

  it('excludes cases the real parser rejects from the lexable set', () => {
    for (const c of lexableCases()) {
      expect(c.errorCount, c.id).toBe(0);
    }
    // Launcher wrappers built for cmd.exe are not standalone PowerShell.
    expect(lexableCases().length).toBeLessThan(lexerOracle.cases.length);
  });

  // Token offsets are what Husk will use to map a gap back to a source
  // position, so they must actually index the source they came from.
  it('gives token offsets that slice back to the token text', () => {
    for (const c of lexableCases()) {
      for (const t of c.tokens) {
        if (t.kind === 'EndOfInput') continue;
        expect(c.source.slice(t.start, t.end), `${c.id}: ${t.kind}`).toBe(t.text);
      }
    }
  });

  it('gives monotonically ordered, non-overlapping tokens', () => {
    for (const c of lexableCases()) {
      let previousEnd = 0;
      for (const t of c.tokens) {
        expect(t.start, c.id).toBeGreaterThanOrEqual(previousEnd);
        expect(t.end, c.id).toBeGreaterThanOrEqual(t.start);
        previousEnd = t.end;
      }
    }
  });

  it('ends every lexable case with EndOfInput', () => {
    for (const c of lexableCases()) {
      expect(c.tokens[c.tokens.length - 1].kind, c.id).toBe('EndOfInput');
    }
  });
});

describe('edge cases the lexer must handle', () => {
  const byId = new Map(edgeCases().map((c) => [c.id, c]));

  it.each([
    'edge/expandable-string-subexpr',
    'edge/here-string-literal',
    'edge/here-string-expandable',
    'edge/backtick-escapes',
    'edge/splatting',
    'edge/unicode-dash-parameter',
    'edge/smart-quote-string',
    'edge/format-operator',
    'edge/argument-mode-dash',
    'edge/expression-mode-dash',
    'edge/number-suffixes',
  ])('has ground truth for %s', (id) => {
    expect(byId.get(id)?.tokens.length).toBeGreaterThan(0);
  });

  // The expression-vs-argument mode distinction is the hardest part of the
  // lexer, so pin that the oracle really does disambiguate these two.
  it('tokenises -5 differently in argument and expression mode', () => {
    const argument = byId.get('edge/argument-mode-dash');
    const expression = byId.get('edge/expression-mode-dash');
    expect(argument).toBeDefined();
    expect(expression).toBeDefined();

    const kinds = (c: typeof argument) => c!.tokens.map((t) => t.kind).join(',');
    expect(kinds(argument)).not.toBe(kinds(expression));
  });
});
