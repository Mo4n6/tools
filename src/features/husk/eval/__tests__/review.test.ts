import { describe, expect, it } from 'vitest';

import { deobfuscate } from '../pipeline';
import { parseExpression } from '../parser';
import { createContext, evaluate } from '../evaluator';
import { Trace } from '../../core/trace';
import { toStringValue } from '../../core/value';
import { isTainted } from '../../core/taint';

const evalPs = (source: string): { text: string; tainted: boolean } => {
  const trace = new Trace(source);
  const value = evaluate(parseExpression(source).expression, createContext(trace));
  return { text: toStringValue(value), tainted: isTainted(value.taint) };
};

// Regressions for findings raised in review on PR #186. Each one was a way of
// presenting an unresolved or wrong result as a trustworthy answer, which is
// the single failure mode this project is built to avoid.

describe('base64 is only promoted to a layer when it reaches an execution sink', () => {
  it('does not replace the script with decoy bytes that are never run', async () => {
    // 'V3JpdGUtSG9zdCAiZGVjb3ki' decodes to Write-Host "decoy".
    const result = await deobfuscate(
      `[Convert]::FromBase64String('V3JpdGUtSG9zdCAiZGVjb3ki'); Write-Host 'real'`,
    );
    expect(result.output).toContain("Write-Host 'real'");
    expect(result.output).not.toContain('decoy');
  });

  it('still promotes it when the decoded value is executed', async () => {
    const result = await deobfuscate(
      `IEX ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('V3JpdGUtSG9zdCAiZGVjb3ki')))`,
    );
    expect(result.output).toContain('decoy');
  });
});

describe('unresolved output is never reported as reliable', () => {
  it('marks a recognised residue as unreliable', async () => {
    const result = await deobfuscate('IEX $x');
    expect(result.trace.gaps.ranked().length).toBeGreaterThan(0);
    expect(result.reliable).toBe(false);
  });

  it('marks layer-budget exhaustion as unreliable', async () => {
    const nested = `IEX ('IEX ' + "('IEX ' + \\"('Write-Host 1')\\")")`;
    const result = await deobfuscate(nested, { maxLayers: 1 });
    expect(result.reliable).toBe(false);
    expect(result.trace.gaps.ranked().some((g) => /budget/.test(g.signature))).toBe(true);
  });

  it('still reports a fully resolved sample as reliable', async () => {
    const result = await deobfuscate("Write-Host ('a'+'b')");
    expect(result.reliable).toBe(true);
  });
});

describe('taint survives indexing', () => {
  // A tainted container holding clean elements must not launder them.
  it('keeps container taint when selecting an element', () => {
    const { tainted } = evalPs(`($env:userdomain + 'Write-Host').Split('.')[0]`);
    expect(tainted).toBe(true);
  });

  it('leaves a clean array clean', () => {
    const { tainted } = evalPs(`('a,b' -split ',')[0]`);
    expect(tainted).toBe(false);
  });
});

describe('-split takes a regular expression', () => {
  it('splits on a character class', () => {
    expect(evalPs(`('a1b2c' -split '\\d') -join '|'`).text).toBe('a|b|c');
  });

  it('splits on an alternation', () => {
    expect(evalPs(`('a-b_c' -split '[-_]') -join '|'`).text).toBe('a|b|c');
  });

  it('falls back to a literal search for a pattern that will not compile', () => {
    expect(evalPs(`('a[b' -split '[') -join '|'`).text).toBe('a|b');
  });
});

describe('-replace honours capture substitutions', () => {
  it('reorders numbered groups', () => {
    expect(evalPs(`'ab' -replace '(a)(b)','$2$1'`).text).toBe('ba');
  });

  it('supports $& for the whole match', () => {
    expect(evalPs(`'abc' -replace 'b','[$&]'`).text).toBe('a[b]c');
  });

  it('translates .NET named groups to the JavaScript spelling', () => {
    expect(evalPs(`'ab' -replace '(?<first>a)(?<second>b)','\${second}\${first}'`).text).toBe('ba');
  });

  it('still replaces plain text', () => {
    expect(evalPs(`'MPBxMPB' -replace 'MPB','"'`).text).toBe('"x"');
  });
});
