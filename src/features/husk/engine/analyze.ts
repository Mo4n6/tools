// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// One engine run, as an AnalysisResult.
//
// This is the claim in husk-sandbox-spec.md §6 made good: "a front-end's only
// job is to execute its language and emit HostCalls… a new front-end inherits
// the entire reporting layer". The host scanner and the IOC extractor run over
// the finished trace exactly as they do for the tree-walker, with no idea which
// produced it.
//
// What the engine adds beyond that shared shape is artefacts the tree-walker
// cannot produce at all, because it never executes: files the sample actually
// dropped, with their hashes, and the registry as it left it.

import type { AnalysisResult } from '../analyze';
import { describeLauncher, parseLauncher } from '../eval/launcher';
import { scanAllLayers } from '../host/stubs';
import { extractIocs } from '../ioc/extract';
import { adaptRun, type DroppedFile, type RegistryWrite } from './adapt';
import type { EngineRun } from './types';

export interface EngineAnalysisResult extends AnalysisResult {
  /** Which front-end produced this, since the two differ in what they can see. */
  readonly backend: 'engine';
  readonly registryWrites: readonly RegistryWrite[];
  readonly dropped: readonly DroppedFile[];
  /**
   * Set when a budget cut the run short. The result above is still evidence —
   * partial, not failed — and the UI has to say which.
   */
  readonly stoppedBy?: string;
  /** The first error the sample raised, terminating or not. */
  readonly engineError?: string;
  /**
   * Whether the pipeline ran to the end. False means the analysis stopped
   * early and the sample may have had more to do.
   */
  readonly completed: boolean;
}

/**
 * Narrows a result to an engine one.
 *
 * Checks the discriminant rather than a flag the caller passes in, so a result
 * that travelled through structured cloning still answers correctly.
 */
export function isEngineResult(result: AnalysisResult): result is EngineAnalysisResult {
  return (result as EngineAnalysisResult).backend === 'engine';
}

/**
 * Turns one engine run into the result the rest of Husk already renders.
 *
 * `source` is what the analyst pasted, which may be a launcher command line;
 * the launcher facts are reported the same way they are for the tree-walker,
 * because `-w hidden -nop -ep bypass` is a sentence about intent whichever
 * backend ran afterwards.
 */
export function analyzeRun(source: string, run: EngineRun, elapsedMs: number): EngineAnalysisResult {
  const adapted = adaptRun(source, run);
  const { trace } = adapted;

  // The same two passes the tree-walker's analyze() makes, in the same order,
  // over a trace neither pass can tell apart from the tree-walker's.
  scanAllLayers(trace);
  const iocs = extractIocs(trace);

  const launcher = parseLauncher(source);

  return {
    backend: 'engine',
    layers: trace.layers,
    output: adapted.output,
    events: trace.events,
    iocs,
    // A run that was cut short, or that stopped early, or that recorded a
    // vocabulary gap, is not a result to be relied on without reading why.
    reliable: trace.isReliable && adapted.stoppedBy === undefined && adapted.completed,
    gaps: trace.gaps.ranked(),
    actionableGaps: trace.gaps.actionable(),
    launcher: launcher.isLauncher ? launcher : undefined,
    launcherSummary: describeLauncher(launcher),
    registryWrites: adapted.registryWrites,
    dropped: adapted.dropped,
    stoppedBy: adapted.stoppedBy,
    engineError: adapted.error,
    completed: adapted.completed,
    elapsedMs,
  };
}
