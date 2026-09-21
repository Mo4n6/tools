// Drives the analysis worker from React.
//
// A new request supersedes the one in flight: an analyst editing a paste box
// should see the latest result, not a queue of stale ones.

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AnalysisResult, AnalyzeOptions } from './analyze';
import type { HuskRequest, HuskResponse } from './husk.worker';
import type { Ioc, IocKind } from './ioc/types';

export type HuskStatus = 'idle' | 'running' | 'done' | 'error';

export interface HuskState {
  readonly status: HuskStatus;
  readonly result?: AnalysisResult;
  readonly error?: string;
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
  run: (source: string, options?: AnalyzeOptions) => void;
  reset: () => void;
} {
  const [state, setState] = useState<HuskState>({ status: 'idle' });
  const workerRef = useRef<Worker | null>(null);
  const latestId = useRef(0);

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
          result: { ...result, iocs: { ...result.iocs, byKind: regroup(result.iocs.indicators) } },
        });
      } else {
        setState({ status: 'error', error: message.error });
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

  const run = useCallback((source: string, options?: AnalyzeOptions) => {
    if (source.trim().length === 0) {
      setState({ status: 'idle' });
      return;
    }
    const worker = workerRef.current;
    if (!worker) return;

    latestId.current += 1;
    setState({ status: 'running' });
    const request: HuskRequest = { id: latestId.current, source, options };
    worker.postMessage(request);
  }, []);

  const reset = useCallback(() => {
    latestId.current += 1;
    setState({ status: 'idle' });
  }, []);

  return { state, run, reset };
}
