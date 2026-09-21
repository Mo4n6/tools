// Corpus types.
//
// Fixtures are generated, never hand-written: see scripts/husk/*.ps1 and
// docs/husk-spec.md section 6. The point is ground truth we did not author,
// so a fixture cannot encode the same misunderstanding as the code it tests.
//
// TEST-ONLY. Nothing under corpus/ is imported by the app bundle.

/** One obfuscated sample with its known plaintext. */
export interface CorpusFixture {
  /** e.g. "write-host/token-String-1" */
  readonly id: string;
  /** The Invoke-Obfuscation function that produced it. */
  readonly transform: string;
  readonly level: number;
  /** Which known payload this was generated from. */
  readonly payload: string;
  /** What deobfuscation must recover. */
  readonly expected: string;
  readonly obfuscated: string;
}

/** A fixture built by stacking transforms, the way real droppers are. */
export interface LayeredFixture extends CorpusFixture {
  /** The transforms applied, outermost last. */
  readonly layers: readonly string[];
}

export interface LayeredCorpus {
  readonly generator: string;
  readonly generatedFor: string;
  readonly payloads: Readonly<Record<string, string>>;
  readonly fixtures: readonly LayeredFixture[];
}

export interface Corpus {
  readonly generator: string;
  readonly generatedFor: string;
  readonly payloads: Readonly<Record<string, string>>;
  readonly fixtures: readonly CorpusFixture[];
}

/** One token as the real PowerShell tokenizer produced it. */
export interface OracleToken {
  /** A TokenKind name, e.g. "Identifier", "StringLiteral". */
  readonly kind: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface OracleCase {
  /** "corpus/<fixture id>" or "edge/<name>". */
  readonly id: string;
  readonly source: string;
  readonly tokens: readonly OracleToken[];
  /**
   * How many parse errors real PowerShell reported. Non-zero means the source
   * is not standalone PowerShell - launcher wrappers built for cmd.exe, for
   * instance - so it is not a target for token-stream equality.
   */
  readonly errorCount: number;
}

export interface LexerOracle {
  /** The PowerShell build that produced these streams. */
  readonly powerShellVersion: string;
  readonly cases: readonly OracleCase[];
}
