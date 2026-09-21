// Corpus loader.
//
// TEST-ONLY. These fixtures are ~900KB and must never reach the app bundle;
// import them from tests and generators only.

import rawCorpus from './fixtures/invoke-obfuscation.json';
import rawLayered from './fixtures/layered.json';
import rawOracle from './fixtures/lexer-oracle.json';
import type {
  Corpus,
  CorpusFixture,
  LayeredCorpus,
  LayeredFixture,
  LexerOracle,
  OracleCase,
} from './types';

export type {
  Corpus,
  CorpusFixture,
  LayeredCorpus,
  LayeredFixture,
  LexerOracle,
  OracleCase,
  OracleToken,
} from './types';

export const corpus = rawCorpus as unknown as Corpus;
export const lexerOracle = rawOracle as unknown as LexerOracle;

/**
 * Fixtures built by stacking transforms. Single-transform fixtures answer
 * "can Husk undo X"; these answer "can it undo X inside Y inside Z", which is
 * what real droppers are and where the interactions break things.
 */
export const layeredCorpus = rawLayered as unknown as LayeredCorpus;

export const fixtures: readonly CorpusFixture[] = corpus.fixtures;

export const layeredFixtures: readonly LayeredFixture[] = layeredCorpus.fixtures;

/** Every fixture, single-transform and layered. */
export const allFixtures: readonly CorpusFixture[] = [...fixtures, ...layeredFixtures];

/** Layered fixtures grouped by how many transforms were stacked. */
export function layeredByDepth(depth: number): readonly LayeredFixture[] {
  return layeredFixtures.filter((f) => f.layers.length === depth);
}

/** Fixtures from one Invoke-Obfuscation transform, e.g. "Out-CompressedCommand". */
export function fixturesByTransform(transform: string): readonly CorpusFixture[] {
  return fixtures.filter((f) => f.transform === transform);
}

/** Every distinct transform in the corpus, sorted. */
export function transforms(): readonly string[] {
  return [...new Set(fixtures.map((f) => f.transform))].sort();
}

/**
 * Oracle cases that are valid standalone PowerShell, and so are fair targets
 * for token-stream equality. Launcher wrappers built for cmd.exe are excluded.
 */
export function lexableCases(): readonly OracleCase[] {
  return lexerOracle.cases.filter((c) => c.errorCount === 0);
}

/** The hand-picked edge cases, separate from the generated corpus samples. */
export function edgeCases(): readonly OracleCase[] {
  return lexerOracle.cases.filter((c) => c.id.startsWith('edge/'));
}
