// Indicators of compromise harvested from a deobfuscation run.

export type IocKind =
  | 'url'
  | 'ipv4'
  | 'domain'
  | 'email'
  | 'filepath'
  | 'registry'
  | 'scheduled-task'
  | 'mutex'
  | 'hash'
  | 'base64-blob'
  | 'pe';

/** How much to trust an indicator. */
export type IocConfidence =
  /** Unambiguous, e.g. a full URL or a registry Run key. */
  | 'high'
  /** Shape matches but could be incidental, e.g. a bare domain-like token. */
  | 'medium';

export interface Ioc {
  readonly kind: IocKind;
  readonly value: string;
  /**
   * Defanged for safe sharing: hxxp://, [.] for dots. Analysts paste these
   * into tickets and chat, where a live URL is a hazard.
   */
  readonly defanged: string;
  /** The decoded layer it was found in. 0 is the pasted input. */
  readonly layer: number;
  readonly offset: number;
  /** Surrounding source, trimmed, for judging whether it is real. */
  readonly context: string;
  readonly confidence: IocConfidence;
  /** How many times it appears across all layers. */
  readonly occurrences: number;
}

export interface IocReport {
  readonly indicators: readonly Ioc[];
  /** Indicators grouped by kind, each already sorted. */
  readonly byKind: ReadonlyMap<IocKind, readonly Ioc[]>;
  /** True when a PE header was found in a decoded blob. */
  readonly hasEmbeddedPe: boolean;
}
