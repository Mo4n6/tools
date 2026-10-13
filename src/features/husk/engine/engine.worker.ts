// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// The wasm engine, in a Worker.
//
// A Worker is not a nicety here, it is the only correct place for it. The
// engine installs a `globalThis.fetch` hook — that is how a sample's network
// traffic gets recorded and refused below the CLR, where .NET cannot reach
// around it — and on the main thread that hook would be the *page's* fetch.
// Every request the rest of the app makes would go through a boundary built
// for malware. In a Worker the hook is scoped to this thread and the page is
// untouched.
//
// Two more things fall out of it: the 16 MB engine download does not block the
// main thread, and a sample that defeats the step budget cannot freeze the tab,
// because the worker can be terminated from outside. That is the same reason
// husk.worker.ts exists for the tree-walker.
//
// The engine itself is NOT bundled. It is a .NET wasm build published
// separately, loaded from a URL at runtime, so this file must never import it
// statically.

import { analyzeRun, type EngineAnalysisResult } from './analyze';
import { parseLauncher } from '../eval/launcher';
import { engineUrl } from './paths';
import type { EngineRun } from './types';

/** What the engine's own module puts on the worker's global scope. */
interface EngineGlobals {
  psInit(): string;
  runFixture(script: string): EngineRun['result'];
  hostCalls(): EngineRun['hostCalls'];
  registryDump(): EngineRun['registry'];
  droppedFiles(): EngineRun['dropped'];
  /** The file's bytes. .NET's `byte[]` marshals straight to a Uint8Array. */
  readDropped(path: string): Uint8Array;
  proxyCalls(): unknown;
  snapshotFs(): number;
  setNetworkMode(mode: 'blocked' | 'live'): void;
  setBudget(steps: number, milliseconds: number): void;
  /** Clears supplied bodies and the per-run download caps. */
  resetDownloads(): void;
  /** Empties the JS boundary ledger. The other half of `proxyCalls()`. */
  drainBoundary(): number;
  /** Key: a whole URL, a bare filename, or '*' for anything. */
  supplyDownload(key: string, content: string | Uint8Array): number;
}

export interface EngineInit {
  readonly kind: 'init';
  /** Where the published engine lives, e.g. '/husk-engine/'. */
  readonly baseUrl: string;
  readonly networkMode?: 'blocked' | 'live';
  readonly budget?: { readonly steps: number; readonly milliseconds: number };
}

/**
 * A body the engine serves when the sample downloads it.
 *
 * Supplied per run rather than per session, because a stage belongs to one
 * sample: carrying it into the next run would answer another sample's download
 * with the previous one's payload, the way registry and layer state are also
 * reset per run.
 */
export interface SuppliedDownload {
  /** A whole URL, a bare filename, or '*' for anything the sample asks for. */
  readonly key: string;
  /**
   * Bytes for a payload, a string for a script. Both survive structured
   * cloning, and the distinction matters: an executable round-tripped through
   * a string comes out corrupted, and the analyst would only find out after
   * saving it and looking at the hash.
   */
  readonly content: string | Uint8Array;
}

export interface EngineRunRequest {
  readonly kind: 'run';
  readonly id: number;
  readonly script: string;
  readonly downloads?: readonly SuppliedDownload[];
  /**
   * Overrides the mode `init` set, for this run. Live fetching only reaches
   * hosts that send CORS headers, which real C2 infrastructure does not.
   */
  readonly networkMode?: 'blocked' | 'live';
}

export interface EngineReadRequest {
  readonly kind: 'read';
  readonly id: number;
  /** The engine's own path, as `EngineRun['dropped'][n].path` gives it. */
  readonly path: string;
}

export type EngineRequest = EngineInit | EngineRunRequest | EngineReadRequest;

export type EngineResponse =
  | { readonly kind: 'ready'; readonly ok: true }
  | { readonly kind: 'ready'; readonly ok: false; readonly error: string }
  | {
      readonly kind: 'run';
      readonly id: number;
      readonly ok: true;
      readonly result: EngineAnalysisResult;
    }
  | { readonly kind: 'run'; readonly id: number; readonly ok: false; readonly error: string }
  | { readonly kind: 'read'; readonly id: number; readonly ok: true; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly kind: 'read'; readonly id: number; readonly ok: false; readonly error: string };

let engine: EngineGlobals | undefined;

/**
 * What `init` asked for, so a run that says nothing about the network gets the
 * session's answer rather than the previous run's.
 */
let defaultNetworkMode: 'blocked' | 'live' = 'blocked';

const post = (message: EngineResponse): void =>
  (self as unknown as Worker).postMessage(message);

/**
 * Loads the engine module and waits for it to finish booting.
 *
 * The module is an ES module that resolves `./_framework/…` against its own
 * location, so it has to be imported by URL from where it was published —
 * hence the `@vite-ignore`, which keeps the bundler from trying to resolve or
 * inline a 16 MB .NET build at compile time.
 */
async function load(baseUrl: string): Promise<EngineGlobals> {
  const url = engineUrl(baseUrl, 'main.js');
  await import(/* @vite-ignore */ url);

  const globals = self as unknown as Partial<EngineGlobals>;
  if (typeof globals.psInit !== 'function' || typeof globals.runFixture !== 'function') {
    throw new Error(
      `the module at ${url} loaded but did not install the engine — wrong build, or a partial upload`,
    );
  }

  const init = String(globals.psInit()).trim();
  if (init !== 'OK') {
    // The engine's own message, which names the missing assembly or the
    // failing proxy. Far more useful than "init failed".
    throw new Error(`engine refused to start: ${init.slice(0, 500)}`);
  }

  return globals as EngineGlobals;
}

/**
 * Copies the engine's bytes into an array the page can own.
 *
 * `readDropped` marshals .NET's `byte[]` to a Uint8Array over the wasm heap.
 * Posting that across to the main thread hands the page a view of the engine's
 * memory, and `Blob` will not take it either — it wants an array backed by a
 * plain ArrayBuffer. One copy, at the only place it has to happen.
 */
function toOwnedBytes(view: Uint8Array): Uint8Array<ArrayBuffer> {
  const owned = new Uint8Array(new ArrayBuffer(view.length));
  owned.set(view);
  return owned;
}

self.onmessage = async (event: MessageEvent<EngineRequest>): Promise<void> => {
  const message = event.data;

  if (message.kind === 'init') {
    try {
      engine = await load(message.baseUrl);
      defaultNetworkMode = message.networkMode ?? 'blocked';
      engine.setNetworkMode(defaultNetworkMode);
      if (message.budget !== undefined) {
        engine.setBudget(message.budget.steps, message.budget.milliseconds);
      }
      post({ kind: 'ready', ok: true });
    } catch (error) {
      post({
        kind: 'ready',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (engine === undefined) {
    post({ kind: message.kind, id: message.id, ok: false, error: 'the engine is not loaded' });
    return;
  }

  try {
    if (message.kind === 'read') {
      post({
        kind: 'read',
        id: message.id,
        ok: true,
        bytes: toOwnedBytes(engine.readDropped(message.path)),
      });
      return;
    }

    // Downloads reset before the baseline is taken, not after: resetting
    // deletes the bodies the last run kept, and a snapshot taken first would
    // record them as pre-existing and then hide this run's from the diff.
    // Unconditional, because the per-run caps live behind the same call -
    // skipping it would let one sample's resolution count limit the next.
    engine.resetDownloads();

    // Set unconditionally, against the mode `init` chose rather than against
    // whatever the last run left behind. Applying it only when the field was
    // present let one run's `live` persist into a run that did not ask for it,
    // and reset it out from under an engine initialised live.
    engine.setNetworkMode(message.networkMode ?? defaultNetworkMode);

    // Drain all three ledgers, so this run's evidence is only this run's. The
    // boundary one was the half that got missed, and it is the one that holds
    // network records.
    engine.proxyCalls();
    engine.drainBoundary();
    engine.snapshotFs();

    if (message.networkMode !== undefined) engine.setNetworkMode(message.networkMode);
    for (const supplied of message.downloads ?? []) {
      engine.supplyDownload(supplied.key, supplied.content);
    }

    // What an analyst pastes is very often a command line, not a script:
    // `powershell -nop -w hidden -enc <base64>`. Handing that to the engine
    // runs it as PowerShell, where `powershell` is not a command and nothing
    // executes - so the launcher the sample is wrapped in has to come off
    // first, exactly as it does for the tree-walker. The original string is
    // still what analyzeRun reports on, so the launcher's own switches are
    // read back out of it.
    const started = Date.now();
    const run: EngineRun = {
      result: engine.runFixture(parseLauncher(message.script).script),
      hostCalls: engine.hostCalls(),
      registry: engine.registryDump(),
      dropped: engine.droppedFiles(),
    };

    // Analysed here rather than on the main thread. The host scan and the IOC
    // extraction run regexes over the sample's own text, and the one rule the
    // whole design turns on is that the payload never reaches the page. The
    // IOC index is a Map, which structured cloning carries but React cannot
    // read back conveniently, so it is rebuilt on the other side.
    const result = analyzeRun(message.script, run, Date.now() - started);
    post({
      kind: 'run',
      id: message.id,
      ok: true,
      result: { ...result, iocs: { ...result.iocs, byKind: new Map() } },
    });
  } catch (error) {
    post({
      kind: message.kind,
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
