// Shared helper for measuring the tokenizer against the real PowerShell one.
//
// Kept out of the test file so the same comparison drives both the assertions
// and the coverage report.

import { lexableCases } from '../../corpus';
import type { OracleCase } from '../../corpus';
import { TOKEN_TEXT, TokenKind } from '../tokenKind';
import { tokenize } from '../tokenizer';

/** Token kinds real PowerShell reports that Husk does not model as tokens. */
const IGNORED_KINDS = new Set(['LineContinuation']);

export interface CaseResult {
  readonly id: string;
  readonly matched: boolean;
  /** Index of the first differing token, or -1 when the streams match. */
  readonly divergedAt: number;
  readonly expected?: string;
  readonly actual?: string;
  readonly context?: string;
}

const kindName = (kind: TokenKind): string => TokenKind[kind] ?? String(kind);

function normalize(kinds: readonly string[]): readonly string[] {
  return kinds.filter((k) => !IGNORED_KINDS.has(k));
}

export function compareCase(oracleCase: OracleCase): CaseResult {
  const expected = normalize(oracleCase.tokens.map((t) => t.kind));
  const actual = normalize(tokenize(oracleCase.source).tokens.map((t) => kindName(t.kind)));

  const limit = Math.max(expected.length, actual.length);
  for (let i = 0; i < limit; i += 1) {
    if (expected[i] !== actual[i]) {
      const from = Math.max(0, i - 3);
      return {
        id: oracleCase.id,
        matched: false,
        divergedAt: i,
        expected: expected[i] ?? '<end>',
        actual: actual[i] ?? '<end>',
        context: [
          `  expected: ${expected.slice(from, i + 4).join(' ')}`,
          `  actual:   ${actual.slice(from, i + 4).join(' ')}`,
          `  source:   ${JSON.stringify(oracleCase.source.slice(0, 160))}`,
        ].join('\n'),
      };
    }
  }

  return { id: oracleCase.id, matched: true, divergedAt: -1 };
}

export function runAll(): readonly CaseResult[] {
  return lexableCases().map(compareCase);
}

/** How many cases match, as a fraction. This is the number that must climb. */
export function coverage(): { matched: number; total: number; ratio: number } {
  const results = runAll();
  const matched = results.filter((r) => r.matched).length;
  return { matched, total: results.length, ratio: matched / results.length };
}

/** Failures grouped by the kind pair they disagree on, worst first. */
export function failureGroups(): ReadonlyArray<{ signature: string; count: number; sample: CaseResult }> {
  const groups = new Map<string, { count: number; sample: CaseResult }>();

  for (const result of runAll()) {
    if (result.matched) continue;
    const signature = `${result.expected} != ${result.actual}`;
    const existing = groups.get(signature);
    if (existing) existing.count += 1;
    else groups.set(signature, { count: 1, sample: result });
  }

  return [...groups.entries()]
    .map(([signature, g]) => ({ signature, ...g }))
    .sort((a, b) => b.count - a.count);
}

export { TOKEN_TEXT };
