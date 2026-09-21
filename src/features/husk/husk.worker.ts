// Analysis runs in a Worker so that an anti-analysis sample cannot hang the
// tab. Spec commitment 4: budgets are enforced, not advisory.
//
// The payload is data here as everywhere else - the worker parses and folds it
// with the tree-walking interpreter and never hands it to the JS engine.

import { analyze, type AnalysisResult, type AnalyzeOptions } from './analyze';

export interface HuskRequest {
  readonly id: number;
  readonly source: string;
  readonly options?: AnalyzeOptions;
}

export type HuskResponse =
  | { readonly id: number; readonly ok: true; readonly result: AnalysisResult }
  | { readonly id: number; readonly ok: false; readonly error: string };

self.onmessage = async (event: MessageEvent<HuskRequest>): Promise<void> => {
  const { id, source, options } = event.data;

  try {
    const result = await analyze(source, options);
    // Maps do not survive structured cloning in a form React can read back
    // conveniently, so the IOC index is rebuilt on the main thread.
    const response: HuskResponse = {
      id,
      ok: true,
      result: { ...result, iocs: { ...result.iocs, byKind: new Map() } },
    };
    (self as unknown as Worker).postMessage(response);
  } catch (error) {
    const response: HuskResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
