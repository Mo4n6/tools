// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Engine output into a Trace.
//
// The engine executes; this decides what any of it means to the rest of Husk.
// Everything downstream — the IOC extractor, the gap ledger, the UI — works on
// `Trace`, so a front-end's whole job is to fill one in. Getting that right
// here is what lets the engine replace the tree-walker without touching
// anything else.
//
// Three rules, each of which cost something to learn:
//
// 1. **An op Husk does not know is a gap, not a crash and not a silent drop.**
//    The engine is a separate build; an op it emits that is missing from
//    `host/ops.ts` means the two vocabularies have drifted, and the analyst
//    should be told rather than quietly shown one fewer indicator. Measured:
//    the engine was emitting `network.client` for `New-Object Net.WebClient`,
//    an op that existed nowhere else.
// 2. **Where a call was seen is part of the evidence.** Four chokepoints with
//    different blind spots, and one of them — `proxy` — is script-reachable
//    and therefore forgeable. Collapsing them would hide that.
// 3. **A registry dump has to say what the sample wrote**, not what Husk
//    seeded for it to read. Without the flag the Shell Folders seed sits next
//    to a Run-key write looking identical.

import { type GapSeed } from '../core/gaps';
import { Trace, type EventOrigin } from '../core/trace';
import { CLEAN } from '../core/taint';
import { classifyAutorun } from '../host/autorun';
import { categoryOf, isHostOp } from '../host/ops';
import type { EngineDroppedFile, EngineHostCall, EngineRun, EngineSource } from './types';

/** Where the engine's virtual C: drive is rooted in its in-memory filesystem. */
const C_DRIVE_ROOT = '/husk-c';

/** A budget stop prefixes its reason; anything else is the sample's own error. */
const BUDGET_PREFIX = 'husk: ';

export interface RegistryWrite {
  /** 'HKEY_CURRENT_USER\\Software\\…\\Run' */
  readonly key: string;
  readonly name: string;
  readonly value: string;
}

export interface DroppedFile {
  /** As the sample wrote it: 'C:\\Users\\Public\\note.txt'. */
  readonly path: string;
  /** The engine's own path, which is what `read` takes. */
  readonly enginePath: string;
  readonly size: number;
  readonly sha256: string;
  readonly head: string;
}

export interface EngineAnalysis {
  readonly trace: Trace;
  /** What the engine printed and returned. */
  readonly output: string;
  /** Registry values the sample wrote. Seeded values are excluded. */
  readonly registryWrites: readonly RegistryWrite[];
  readonly dropped: readonly DroppedFile[];
  /**
   * Set when the run was cut short by a budget. Everything above is still
   * evidence — a partial result, not a failure.
   */
  readonly stoppedBy?: string;
  /** The first error the sample raised, terminating or not. */
  readonly error?: string;
  /**
   * Whether the pipeline ran to the end. False means the analysis is
   * incomplete and the sample may have had more to do.
   */
  readonly completed: boolean;
}

/** The engine's source labels map onto the trace's, which has one more. */
function originOf(source: EngineSource): EventOrigin {
  // 'boundary' is the fetch hook in JavaScript, below the CLR. It is as
  // observed as the others, and the proxy is the one it corresponds to.
  return source === 'boundary' ? 'proxy' : source;
}

/**
 * The engine stores a Windows path under its virtual C: root, because the
 * browser filesystem has one. The analyst wants the path the sample wrote.
 */
export function toWindowsPath(enginePath: string): string {
  if (!enginePath.startsWith(C_DRIVE_ROOT)) return enginePath;

  const tail = enginePath.slice(C_DRIVE_ROOT.length).replace(/\//g, '\\');
  return `C:${tail.startsWith('\\') ? tail : `\\${tail}`}`;
}

function droppedFile(file: EngineDroppedFile): DroppedFile {
  return {
    path: toWindowsPath(file.path),
    enginePath: file.path,
    size: file.size,
    sha256: file.sha256,
    head: file.head,
  };
}

function unknownOpGap(call: EngineHostCall): GapSeed {
  return {
    kind: 'GAP',
    signature: call.native,
    argTypes: [],
    provenance: { layer: 0 },
    detail:
      `the engine reported op '${call.op}', which is not in the canonical ` +
      `vocabulary — host/ops.ts and the engine have drifted apart`,
  };
}

/**
 * Builds a Trace from one engine run.
 *
 * `source` is the original input, which becomes layer 0 the same way it does
 * for the tree-walker, so the analyst always sees what they pasted.
 */
export function adaptRun(source: string, run: EngineRun): EngineAnalysis {
  const trace = new Trace(source);

  // Each text handed to Invoke-Expression is a layer, outermost first. The
  // engine does not report which layer called which, and claiming otherwise
  // would be inventing provenance: each is attributed to the one before it.
  run.result.layers.forEach((text, index) => {
    trace.addLayer(text, { via: 'invoke', operator: 'Invoke-Expression', from: index }, CLEAN);
  });

  for (const call of [...run.hostCalls].sort((a, b) => a.seq - b.seq)) {
    if (!isHostOp(call.op)) {
      trace.gaps.report(unknownOpGap(call));
      continue;
    }

    // A write to an autorun location is reported as the persistence it
    // establishes rather than as the generic write the surface saw. Promotion
    // happens here because every layer - provider, cmdlet, binder and proxy -
    // funnels through this loop, so `Set-ItemProperty HKCU:\…\Run`,
    // `reg.exe add` and a Copy-Item into the Startup folder are all caught
    // once, in one place.
    const op = classifyAutorun(call.op, call.args);

    trace.addEvent({
      provenance: { layer: trace.layers.length - 1 },
      category: categoryOf(op),
      signature: call.native,
      args: call.args,
      taint: CLEAN,
      origin: originOf(call.source),
      op,
    });
  }

  const registryWrites: RegistryWrite[] = [];
  for (const key of run.registry) {
    for (const value of key.values) {
      if (value.seeded) continue;
      registryWrites.push({ key: key.path, name: value.name, value: value.value });
    }
  }

  const error = run.result.error;
  const stopped = error.startsWith(BUDGET_PREFIX);

  return {
    trace,
    output: run.result.output,
    registryWrites,
    dropped: run.dropped.map(droppedFile),
    stoppedBy: stopped ? error.slice(BUDGET_PREFIX.length) : undefined,
    error: error.length > 0 && !stopped ? error : undefined,
    completed: run.result.completed,
  };
}
