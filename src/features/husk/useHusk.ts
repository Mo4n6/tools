// Drives the analysis worker from React.
//
// A new request supersedes the one in flight: an analyst editing a paste box
// should see the latest result, not a queue of stale ones.

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AnalysisResult, AnalyzeOptions } from './analyze';
import {
  EngineClient,
  probeEngine,
  type EngineAvailability,
  type RunOptions as EngineRunOptions,
} from './engine/load';
import type { HuskRequest, HuskResponse } from './husk.worker';
import type { Ioc, IocKind } from './ioc/types';

export type HuskStatus = 'idle' | 'running' | 'done' | 'error';

/**
 * Which front-end ran. They are not interchangeable: the tree-walker reads a
 * script without executing it and is the only one that works from `file://`;
 * the engine is real PowerShell and sees what a sample actually did, at the
 * cost of a 13 MB download it has to fetch first.
 */
export type HuskBackend = 'tree-walker' | 'engine';

export interface HuskState {
  readonly status: HuskStatus;
  readonly result?: AnalysisResult;
  readonly error?: string;
  /** Which backend produced `result`. */
  readonly backend?: HuskBackend;
}

/** Rebuilds the grouped index that structured cloning cannot carry. */
function regroup(indicators: readonly Ioc[]): ReadonlyMap<IocKind, readonly Ioc[]> {
  const byKind = new Map<IocKind, Ioc[]>();
  for (const ioc of indicators) {
    const bucket = byKind.get(ioc.kind);
    if (bucket) bucket.push(ioc);
    else byKind.set(ioc.kind, [ioc]);
  }
  return byKind;
}

export function useHusk(): {
  state: HuskState;
  /** Undefined until the probe answers; then whether an engine is there. */
  engine?: EngineAvailability;
  run: (
    source: string,
    options?: AnalyzeOptions,
    backend?: HuskBackend,
    engineOptions?: EngineRunOptions,
  ) => void;
  /**
   * The bytes of a file the sample dropped. Only the engine produces these —
   * the tree-walker never executes, so nothing is ever written.
   */
  readDropped: (enginePath: string) => Promise<Uint8Array<ArrayBuffer>>;
  reset: () => void;
} {
  const [state, setState] = useState<HuskState>({ status: 'idle' });
  const [engine, setEngine] = useState<EngineAvailability | undefined>(undefined);
  const workerRef = useRef<Worker | null>(null);
  const engineRef = useRef<EngineClient | null>(null);
  const latestId = useRef(0);

  // Probed once, not per run: the answer is a deployment fact. Nothing is
  // downloaded here — it reads the boot manifest, which is a few kilobytes.
  useEffect(() => {
    let cancelled = false;
    void probeEngine().then((availability) => {
      if (!cancelled) setEngine(availability);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const worker = new Worker(new URL('./husk.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event: MessageEvent<HuskResponse>) => {
      const message = event.data;
      // Ignore anything but the newest request.
      if (message.id !== latestId.current) return;

      if (message.ok) {
        const result = message.result;
        setState({
          status: 'done',
          backend: 'tree-walker',
          result: { ...result, iocs: { ...result.iocs, byKind: regroup(result.iocs.indicators) } },
        });
      } else {
        setState({ status: 'error', backend: 'tree-walker', error: message.error });
      }
    };

    worker.onerror = (event) => {
      setState({ status: 'error', error: event.message || 'worker failed' });
    };

    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  /**
   * Runs the engine, loading it on first use.
   *
   * A terminated client is spent — after a hard timeout the engine holds
   * whatever the sample left, and reusing it would mix one sample's evidence
   * into the next — so a fresh client is made per failure rather than per run.
   */
  const runEngine = useCallback(
    async (source: string, baseUrl: string, id: number, engineOptions?: EngineRunOptions) => {
    try {
      if (engineRef.current === null) {
        const client = new EngineClient();
        await client.load(baseUrl);
        engineRef.current = client;
      }

      const result = await engineRef.current.run(source, engineOptions ?? {});
      if (id !== latestId.current) return;

      setState({
        status: 'done',
        backend: 'engine',
        result: { ...result, iocs: { ...result.iocs, byKind: regroup(result.iocs.indicators) } },
      });
    } catch (error) {
      engineRef.current?.terminate();
      engineRef.current = null;
      if (id !== latestId.current) return;

      setState({
        status: 'error',
        backend: 'engine',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const run = useCallback(
    (
      source: string,
      options?: AnalyzeOptions,
      backend: HuskBackend = 'tree-walker',
      engineOptions?: EngineRunOptions,
    ) => {
      if (source.trim().length === 0) {
        setState({ status: 'idle' });
        return;
      }

      latestId.current += 1;
      setState({ status: 'running', backend });

      if (backend === 'engine') {
        const baseUrl = engine?.baseUrl;
        if (baseUrl === undefined) {
          setState({
            status: 'error',
            backend,
            error: engine?.reason ?? 'the engine is still being looked for',
          });
          return;
        }
        void runEngine(source, baseUrl, latestId.current, engineOptions);
        return;
      }

      const worker = workerRef.current;
      if (!worker) return;

      const request: HuskRequest = { id: latestId.current, source, options };
      worker.postMessage(request);
    },
    [engine, runEngine],
  );

  const readDropped = useCallback(async (enginePath: string): Promise<Uint8Array<ArrayBuffer>> => {
    const client = engineRef.current;
    if (client === null) {
      throw new Error('the engine is no longer loaded; re-run the sample');
    }
    return client.read(enginePath);
  }, []);

  const reset = useCallback(() => {
    latestId.current += 1;
    setState({ status: 'idle' });
  }, []);

  return { state, engine, run, readDropped, reset };
}
