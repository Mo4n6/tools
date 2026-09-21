// Measures the pipeline against the corpus. Shared by the coverage assertion
// and the divergence report, so both report the same number.

import { fixtures, layeredByDepth, layeredFixtures } from '../../corpus';
import type { CorpusFixture } from '../../corpus';
import { TokenKind } from '../../lexer/tokenKind';
import { tokenize } from '../../lexer/tokenizer';
import { deobfuscate } from '../pipeline';

/**
 * Compare scripts semantically rather than textually.
 *
 * Folding `('hel'+'lo')` yields `'hello'` while the plaintext says `"hello"`.
 * Those are the same script, so comparison runs over the token stream with
 * strings reduced to their decoded values and quote style discarded. Casing is
 * ignored too, since PowerShell is case-insensitive and obfuscators randomise
 * it.
 */
function normalize(text: string): string {
  return tokenize(text)
    .tokens.filter(
      (t) =>
        t.kind !== TokenKind.EndOfInput &&
        t.kind !== TokenKind.NewLine &&
        t.kind !== TokenKind.Comment &&
        t.kind !== TokenKind.LineContinuation,
    )
    .map((t) => {
      switch (t.kind) {
        case TokenKind.StringLiteral:
        case TokenKind.StringExpandable:
        case TokenKind.HereStringLiteral:
        case TokenKind.HereStringExpandable:
          return `str:${String(t.value ?? '').toLowerCase()}`;
        case TokenKind.Number:
          return `num:${t.value}`;
        default:
          return `${TokenKind[t.kind]}:${t.text.toLowerCase()}`;
      }
    })
    .join(' ');
}

export interface FixtureResult {
  readonly id: string;
  readonly transform: string;
  readonly recovered: boolean;
  readonly layers: number;
  readonly expected: string;
  readonly actual: string;
  readonly topGap?: string;
}

export async function runFixture(fixture: CorpusFixture): Promise<FixtureResult> {
  const result = await deobfuscate(fixture.obfuscated);
  const actual = result.output;
  const ranked = result.trace.gaps.ranked();

  // Recovery means the plaintext is present in the deepest layer - obfuscators
  // wrap the payload in launcher scaffolding that is not part of the original.
  const recovered = normalize(actual).includes(normalize(fixture.expected));

  return {
    id: fixture.id,
    transform: fixture.transform,
    recovered,
    layers: result.trace.layers.length,
    expected: fixture.expected,
    actual,
    ...(ranked.length ? { topGap: `${ranked[0].kind} ${ranked[0].signature}` } : {}),
  };
}

export async function runAll(): Promise<readonly FixtureResult[]> {
  return Promise.all(fixtures.map(runFixture));
}

/** Layered fixtures: the shape real droppers actually have. */
export async function runLayered(): Promise<readonly FixtureResult[]> {
  return Promise.all(layeredFixtures.map(runFixture));
}

export async function layeredCoverage(
  depth?: number,
): Promise<{ recovered: number; total: number; ratio: number }> {
  const set = depth === undefined ? layeredFixtures : layeredByDepth(depth);
  const results = await Promise.all(set.map(runFixture));
  const recovered = results.filter((r) => r.recovered).length;
  return { recovered, total: set.length, ratio: recovered / set.length };
}

export async function coverage(): Promise<{
  recovered: number;
  total: number;
  ratio: number;
  byTransform: ReadonlyMap<string, { recovered: number; total: number }>;
}> {
  const results = await runAll();
  const byTransform = new Map<string, { recovered: number; total: number }>();

  for (const r of results) {
    const bucket = byTransform.get(r.transform) ?? { recovered: 0, total: 0 };
    bucket.total += 1;
    if (r.recovered) bucket.recovered += 1;
    byTransform.set(r.transform, bucket);
  }

  const recovered = results.filter((r) => r.recovered).length;
  return { recovered, total: results.length, ratio: recovered / results.length, byTransform };
}
