// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// The wasm engine's wire shape.
//
// This is what `scripts/husk/wasm-spike/main.js` puts on `globalThis` and what
// the .NET side serialises. It is written down separately from the adapter
// because it is a boundary: the engine is a different language, a different
// build and a different repository history, and nothing on this side should
// assume more about it than these types say.
//
// Everything here is **data from a sample's run**, not from Husk. Paths,
// arguments and registry values are payload-derived. Treat them as hostile
// text: render them, never evaluate them, and redact before sharing.

/** Which capture layer saw a call. See `EventOrigin` in core/trace.ts. */
export type EngineSource = 'binder' | 'cmdlet' | 'provider' | 'proxy' | 'boundary';

export interface EngineHostCall {
  /** Monotonic within a run, so ordering survives serialisation. */
  readonly seq: number;
  /** A canonical op, e.g. 'filesystem.write'. Validated, never trusted. */
  readonly op: string;
  /** What the sample actually wrote: 'Set-ItemProperty', 'Registry::SetProperty'. */
  readonly native: string;
  readonly args: readonly string[];
  readonly source: EngineSource;
}

export interface EngineRegistryValue {
  readonly name: string;
  readonly value: string;
  /** True when Husk seeded it for the sample to read, rather than the sample writing it. */
  readonly seeded: boolean;
}

export interface EngineRegistryKey {
  readonly path: string;
  readonly values: readonly EngineRegistryValue[];
}

export interface EngineDroppedFile {
  /** The engine's virtual path, e.g. '/husk-c/Users/Public/note.txt'. */
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  /** The first bytes, hex-encoded, for a magic-number check without the body. */
  readonly head: string;
}

export interface EngineRunResult {
  /** Everything the script printed and returned. */
  readonly output: string;
  /**
   * The first error the sample raised, terminating or not. Empty when it
   * raised none. A 'husk: ' prefix means a budget stop rather than the
   * sample's own error.
   */
  readonly error: string;
  /**
   * Whether the pipeline ran to the end.
   *
   * Not the same question as whether `error` is empty: `Start-Process` failing
   * is a non-terminating error and the script carries on past it, so a run can
   * complete with an error. Only this says the analysis is incomplete — the
   * sample may have had more to do, and whatever it was is not in this report.
   */
  readonly completed: boolean;
  /**
   * Records the engine's cap discarded this run, 0 normally.
   *
   * A sample decides how many records it makes - a tight loop makes thousands
   * of identical ones - so the ledger is bounded. A call list silently cut
   * short reads like a sample that did less than it did, so the count comes
   * back with it.
   */
  readonly droppedCalls?: number;
  /** Each text handed to Invoke-Expression, outermost first. */
  readonly layers: readonly string[];
}

/** One run, as the adapter receives it. */
export interface EngineRun {
  readonly result: EngineRunResult;
  readonly hostCalls: readonly EngineHostCall[];
  readonly registry: readonly EngineRegistryKey[];
  readonly dropped: readonly EngineDroppedFile[];
}

/**
 * What the loaded engine exposes. A subset of `main.js`'s globals — the parts
 * the product uses, rather than the probes the harnesses use.
 */
export interface EngineHandle {
  run(script: string): EngineRun;
  /** Bytes of a dropped file, for the analyst to save. */
  read(path: string): Uint8Array;
  setNetworkMode(mode: 'blocked' | 'live'): void;
}
