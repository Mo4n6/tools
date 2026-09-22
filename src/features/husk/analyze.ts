// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// The top-level analysis entry point.
//
// One call takes pasted PowerShell and returns everything an analyst needs:
// the decoded layers, the host calls that were recorded rather than performed,
// the indicators harvested from every layer, and an honest account of what
// Husk could not resolve.

import type { GapRecord } from './core/gaps';
import type { Layer, TraceEvent } from './core/trace';
import { deobfuscate, type DeobfuscateOptions } from './eval/pipeline';
import { scanAllLayers } from './host/stubs';
import { extractIocs } from './ioc/extract';
import type { IocReport } from './ioc/types';

export interface AnalysisResult {
  /** Every decoded layer, layer 0 being the pasted input. */
  readonly layers: readonly Layer[];
  /** The deepest layer reached - the closest thing to a final stage. */
  readonly output: string;
  /** Host calls recorded rather than performed. */
  readonly events: readonly TraceEvent[];
  readonly iocs: IocReport;
  /**
   * True when nothing in the output depends on something Husk could not
   * compute. False does not mean the output is wrong - it means it is not
   * guaranteed right, and `gaps` says why.
   */
  readonly reliable: boolean;
  /** Ranked: output-reaching first, then by blast radius. */
  readonly gaps: readonly GapRecord[];
  /** Only the gaps worth implementing - excludes stubs and hard blocks. */
  readonly actionableGaps: readonly GapRecord[];
  readonly elapsedMs: number;
}

export interface AnalyzeOptions extends DeobfuscateOptions {}

/**
 * Analyse a sample.
 *
 * Host scanning runs over the finished trace rather than during unwrapping,
 * so indicators are collected from every layer that was reached - including
 * when the unwrap stopped early. A partial result still surfaces the stage-2
 * URL, which is usually the thing the analyst came for.
 */
export async function analyze(
  source: string,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const started = Date.now();

  const { trace, output, reliable } = await deobfuscate(source, options);
  scanAllLayers(trace);
  const iocs = extractIocs(trace);

  return {
    layers: trace.layers,
    output,
    events: trace.events,
    iocs,
    reliable,
    gaps: trace.gaps.ranked(),
    actionableGaps: trace.gaps.actionable(),
    elapsedMs: Date.now() - started,
  };
}

export type { GapRecord } from './core/gaps';
export type { Layer, TraceEvent } from './core/trace';
export type { Ioc, IocKind, IocReport } from './ioc/types';
