// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// The spec's claim, tested: a new front-end inherits the whole reporting layer
// by emitting the same canonical ops. These run the engine's real captured
// output through the IOC extractor the tree-walker uses, unchanged.

import { describe, expect, it } from 'vitest';

import { analyzeRun } from '../analyze';
import type { EngineRun } from '../types';
import fixture from './fixtures/engine-output.json';

interface Case {
  readonly name: string;
  readonly script: string;
  readonly result: EngineRun['result'];
  readonly hostCalls: EngineRun['hostCalls'];
  readonly registry: EngineRun['registry'];
  readonly dropped: EngineRun['dropped'];
}

function load(name: string): { script: string; run: EngineRun } {
  const found = (fixture.cases as unknown as readonly Case[]).find((c) => c.name === name);
  if (found === undefined) throw new Error(`no captured case named ${name}`);

  const { result, hostCalls, registry, dropped } = found;
  return { script: found.script, run: { result, hostCalls, registry, dropped } };
}

describe('analyzeRun', () => {
  it('extracts the C2 URL with the tree-walker’s own extractor', () => {
    const { script, run } = load('dropper');
    const result = analyzeRun(script, run, 120);

    const urls = result.iocs.indicators.filter((i) => i.kind === 'url').map((i) => i.value);
    expect(urls).toContain('http://evil.test/stage2.ps1');
  });

  it('reports the dropped file with a hash the tree-walker could never have', () => {
    // The tree-walker never executes, so it cannot produce a dropped file at
    // all. This is what the engine is for.
    const { script, run } = load('dropper');
    const result = analyzeRun(script, run, 120);

    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].path).toBe('C:\\Users\\Public\\note.txt');
    expect(result.dropped[0].sha256).toHaveLength(64);
  });

  it('reports the persistence write, and only the sample’s', () => {
    const { script, run } = load('dropper');
    const result = analyzeRun(script, run, 120);

    expect(result.registryWrites).toHaveLength(1);
    expect(result.registryWrites[0].key).toContain('CurrentVersion\\Run');
  });

  it('labels itself, because the two backends see different things', () => {
    const { script, run } = load('dropper');
    expect(analyzeRun(script, run, 1).backend).toBe('engine');
  });

  it('calls a budget stop unreliable without calling it an error', () => {
    const { script, run } = load('budget-exhausted');
    const result = analyzeRun(script, run, 10_000);

    expect(result.stoppedBy).toContain('time budget');
    expect(result.engineError).toBeUndefined();
    // Partial, so not to be relied on — but still a result.
    expect(result.reliable).toBe(false);
    expect(result.completed).toBe(false);
    expect(result.layers.length).toBeGreaterThan(0);
  });

  it('separates a run that stopped from a run that merely errored', () => {
    // Start-Process failing is a non-terminating error: the script carries on
    // past it, so that run did reach the end and its report is complete.
    const dropper = load('dropper');
    expect(analyzeRun(dropper.script, dropper.run, 1).completed).toBe(true);

    const stopped = load('budget-exhausted');
    expect(analyzeRun(stopped.script, stopped.run, 1).completed).toBe(false);
  });

  it('keeps a clean run reliable', () => {
    const { script, run } = load('layered-iex');
    const result = analyzeRun(script, run, 50);

    expect(result.reliable).toBe(true);
    expect(result.stoppedBy).toBeUndefined();
  });

  it('reports the launcher when the paste was a command line', () => {
    const { run } = load('layered-iex');
    const result = analyzeRun('powershell.exe -nop -w hidden -c "Write-Host hi"', run, 10);

    expect(result.launcherSummary).toContain('WindowStyle hidden');
  });

  it('surfaces the engine’s own terminating error as the sample’s, not Husk’s', () => {
    const { script, run } = load('dropper');
    const result = analyzeRun(script, run, 10);

    // That run ended on Start-Process being unsupported, which is the sample
    // hitting a surface Husk does not implement — not a budget stop.
    expect(result.engineError).toContain('System.Diagnostics.Process');
    expect(result.stoppedBy).toBeUndefined();
  });
});
