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

import { engineUrl } from './paths';
import type { EngineRun } from './types';

/** What the engine's own module puts on the worker's global scope. */
interface EngineGlobals {
  psInit(): string;
  runFixture(script: string): EngineRun['result'];
  hostCalls(): EngineRun['hostCalls'];
  registryDump(): EngineRun['registry'];
  droppedFiles(): EngineRun['dropped'];
  readDropped(path: string): string;
  proxyCalls(): unknown;
  snapshotFs(): number;
  setNetworkMode(mode: 'blocked' | 'live'): void;
  setBudget(steps: number, milliseconds: number): void;
}

export interface EngineInit {
  readonly kind: 'init';
  /** Where the published engine lives, e.g. '/husk-engine/'. */
  readonly baseUrl: string;
  readonly networkMode?: 'blocked' | 'live';
  readonly budget?: { readonly steps: number; readonly milliseconds: number };
}

export interface EngineRunRequest {
  readonly kind: 'run';
  readonly id: number;
  readonly script: string;
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
  | { readonly kind: 'run'; readonly id: number; readonly ok: true; readonly run: EngineRun }
  | { readonly kind: 'run'; readonly id: number; readonly ok: false; readonly error: string }
  | { readonly kind: 'read'; readonly id: number; readonly ok: true; readonly bytes: Uint8Array }
  | { readonly kind: 'read'; readonly id: number; readonly ok: false; readonly error: string };

let engine: EngineGlobals | undefined;

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

/** Hex, as `readDropped` returns it, into bytes. */
function fromHex(hex: string): Uint8Array {
  const clean = hex.trim();
  const bytes = new Uint8Array(clean.length >> 1);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

self.onmessage = async (event: MessageEvent<EngineRequest>): Promise<void> => {
  const message = event.data;

  if (message.kind === 'init') {
    try {
      engine = await load(message.baseUrl);
      if (message.networkMode !== undefined) engine.setNetworkMode(message.networkMode);
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
      post({ kind: 'read', id: message.id, ok: true, bytes: fromHex(engine.readDropped(message.path)) });
      return;
    }

    // Drain both ledgers first, so this run's evidence is only this run's.
    engine.proxyCalls();
    engine.snapshotFs();

    const result = engine.runFixture(message.script);
    post({
      kind: 'run',
      id: message.id,
      ok: true,
      run: {
        result,
        hostCalls: engine.hostCalls(),
        registry: engine.registryDump(),
        dropped: engine.droppedFiles(),
      },
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
