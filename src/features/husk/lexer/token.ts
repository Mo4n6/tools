// Token shapes produced by the Husk tokenizer.

import type { TokenKind } from './tokenKind';

export interface Token {
  readonly kind: TokenKind;
  /** Exact source text, so offsets always slice back to it. */
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /**
   * Decoded value for tokens whose text is not their meaning: the contents of
   * a string with escapes resolved, or a number's numeric value. Absent
   * otherwise.
   */
  readonly value?: string | number;
}

/** A problem found while scanning. Tokenizing never throws; it records these. */
export interface TokenizerDiagnostic {
  readonly message: string;
  readonly start: number;
  readonly end: number;
}

export interface TokenizeResult {
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly TokenizerDiagnostic[];
}

/**
 * Which grammar the tokenizer is reading.
 *
 * PowerShell's real tokenizer is driven by its parser, which tells it the mode
 * for each token: the same '-5' is a negative number in expression mode and a
 * parameter-ish argument in command mode. Husk has no parser yet, so it tracks
 * mode with the heuristics in ./modeTracker.ts.
 */
export enum TokenizerMode {
  Expression = 'Expression',
  Command = 'Command',
  /**
   * Inside a type literal's brackets. Dots are part of the name rather than
   * member access, and keywords lose their meaning: `[type]` is the type
   * named "type", not the `type` keyword.
   */
  TypeName = 'TypeName',
}
