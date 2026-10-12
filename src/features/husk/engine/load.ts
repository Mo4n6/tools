// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Loading the engine, and doing without it.
//
// The engine is a 16 MB .NET wasm build published separately from the app, so
// three things have to be true of this file: it must never be a static import
// (nobody pays for the engine until they ask for it), it must say plainly when
// the engine is not there instead of failing obscurely, and the tree-walker
// must remain a complete answer — it is the only one that works from
// `file://`, and it is what serves the first paint.

import type {
  EngineReadRequest,
  EngineRequest,
  EngineResponse,
  EngineRunRequest,
  SuppliedDownload,
} from './engine.worker';
import type { EngineAnalysisResult } from './analyze';
import { engineUrl } from './paths';

export { engineUrl } from './paths';

export interface EngineAvailability {
  readonly available: boolean;
  readonly baseUrl?: string;
  /** Why not, in words an analyst can act on. */
  readonly reason?: string;
}

/**
 * Hard ceiling on one run, beyond the engine's own budget.
 *
 * The engine's step budget is checked at sequence points, so it cannot
 * interrupt anything that never reaches one — a catastrophic regex
 * backtrack inside .NET's own engine, say, which is a known anti-analysis
 * trick and runs entirely inside one statement. Terminating the worker is the
 * only limit that does not depend on the sample cooperating, which is the
 * whole reason the engine runs in a worker.
 */
const HARD_TIMEOUT_MS = 30_000;

export function engineBaseUrl(): string | undefined {
  const configured = import.meta.env.VITE_HUSK_ENGINE_URL?.trim();
  if (configured === undefined || configured.length === 0) return undefined;

  // A setting with no leading slash resolves against the site base, so one
  // value — `husk-engine/` — is right at `/` in dev and at `/tools/` on Pages.
  // The alternative was writing `/tools/` into the deploy workflow, which
  // duplicates a path vite.config.ts already derives from the repository name
  // and would be wrong the moment either moves.
  if (configured.startsWith('/') || /^[a-z]+:\/\//i.test(configured)) return configured;

  return `${import.meta.env.BASE_URL}${configured}`;
}

/**
 * Is a published engine actually there?
 *
 * Checks for the boot manifest rather than the module, because a half-uploaded
 * bundle serves `main.js` happily and then fails deep inside the runtime with
 * a message about an assembly. Better to find out here.
 */
export async function probeEngine(baseUrl = engineBaseUrl()): Promise<EngineAvailability> {
  if (baseUrl === undefined) {
    return {
      available: false,
      reason: 'no engine is configured; set VITE_HUSK_ENGINE_URL to where it is published',
    };
  }

  const manifest = engineUrl(baseUrl, '_framework/blazor.boot.json');

  try {
    const response = await fetch(manifest, { method: 'GET', cache: 'force-cache' });
    if (!response.ok) {
      return { available: false, baseUrl, reason: `${manifest} returned ${response.status}` };
    }

    const boot = (await response.json()) as { resources?: { assembly?: Record<string, string> } };
    const count = Object.keys(boot.resources?.assembly ?? {}).length;
    if (count === 0) {
      return { available: false, baseUrl, reason: 'the boot manifest lists no assemblies' };
    }

    return { available: true, baseUrl };
  } catch (error) {
    return {
      available: false,
      baseUrl,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Thrown when a run outlives the hard timeout and the worker was killed. */
export class EngineTerminated extends Error {
  constructor(readonly afterMs: number) {
    super(`the engine was terminated after ${afterMs} ms without answering`);
    this.name = 'EngineTerminated';
  }
}

type Pending = {
  readonly resolve: (value: never) => void;
  readonly reject: (reason: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
};

/**
 * One engine, in one worker.
 *
 * A client whose worker was terminated is spent: `load` a new one. That is
 * deliberate — after a hard timeout the engine's state is whatever the sample
 * left it, and reusing it would mix one sample's evidence into the next.
 */
/** Per-run inputs that are about the sample, not about the session. */
export interface RunOptions {
  readonly downloads?: readonly SuppliedDownload[];
  readonly networkMode?: 'blocked' | 'live';
}

export class EngineClient {
  private worker?: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private dead = false;

  /** Creates a worker and waits for the engine to boot. */
  async load(baseUrl: string, options: { networkMode?: 'blocked' | 'live' } = {}): Promise<void> {
    if (this.dead) throw new Error('this engine was terminated; create a new client');

    const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), {
      type: 'module',
      name: 'husk-engine',
    });
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<EngineResponse>) => this.receive(event.data);

    const ready = new Promise<void>((resolve, reject) => {
      worker.addEventListener('message', function once(event: MessageEvent<EngineResponse>) {
        const message = event.data;
        if (message.kind !== 'ready') return;

        worker.removeEventListener('message', once as EventListener);
        if (message.ok) resolve();
        else reject(new Error(message.error));
      } as EventListener);

      worker.addEventListener('error', (event) =>
        reject(new Error(`the engine worker failed to start: ${event.message}`)),
      );
    });

    const init: EngineRequest = {
      kind: 'init',
      baseUrl,
      networkMode: options.networkMode ?? 'blocked',
    };
    worker.postMessage(init);
    await ready;
  }

  /**
   * Runs one script and returns the finished analysis.
   *
   * `options.downloads` gives the engine bodies to serve when the sample
   * downloads something, which is how a chain gets followed: a browser cannot
   * read a response from a server that sends no CORS headers, and C2
   * infrastructure sends none, so the analyst supplies the stage.
   *
   * Rejects with `EngineTerminated` if the worker had to be killed. The
   * analysis happens in the worker, so the sample's text never reaches the
   * page.
   */
  run(script: string, options: RunOptions = {}): Promise<EngineAnalysisResult> {
    return this.send<EngineAnalysisResult>(
      (id) =>
        ({
          kind: 'run',
          id,
          script,
          downloads: options.downloads,
          networkMode: options.networkMode,
        }) satisfies EngineRunRequest,
    );
  }

  /** The bytes of a file the sample dropped, for the analyst to save. */
  read(enginePath: string): Promise<Uint8Array<ArrayBuffer>> {
    return this.send<Uint8Array<ArrayBuffer>>(
      (id) => ({ kind: 'read', id, path: enginePath }) satisfies EngineReadRequest,
    );
  }

  /** Kills the worker. Safe to call more than once. */
  terminate(): void {
    this.dead = true;
    this.worker?.terminate();
    this.worker = undefined;
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new EngineTerminated(HARD_TIMEOUT_MS));
    }
    this.pending.clear();
  }

  private send<T>(build: (id: number) => EngineRequest): Promise<T> {
    const worker = this.worker;
    if (worker === undefined) {
      return Promise.reject(new Error('the engine is not loaded'));
    }

    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        // The sample won. Kill the worker rather than wait on it.
        this.terminate();
      }, HARD_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: resolve as (value: never) => void,
        reject,
        timer,
      });
      worker.postMessage(build(id));
    });
  }

  private receive(message: EngineResponse): void {
    if (message.kind === 'ready') return;

    const entry = this.pending.get(message.id);
    if (entry === undefined) return;

    this.pending.delete(message.id);
    clearTimeout(entry.timer);

    if (message.ok) {
      entry.resolve((message.kind === 'run' ? message.result : message.bytes) as never);
    } else {
      entry.reject(new Error(message.error));
    }
  }
}
