// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Every case here runs against `fixtures/engine-output.json`, which is **real
// output captured from the wasm engine**, not hand-written. The capture script
// is scripts/husk/wasm-spike, and re-capturing it is how this test stays
// honest: if the engine's wire shape changes, these fail.

import { describe, expect, it } from 'vitest';

import { isHostOp } from '../../host/ops';
import { adaptRun, toWindowsPath } from '../adapt';
import type { EngineRun } from '../types';
import fixture from './fixtures/engine-output.json';

interface Case {
  readonly name: string;
  readonly note: string;
  readonly script: string;
  readonly result: EngineRun['result'];
  readonly hostCalls: EngineRun['hostCalls'];
  readonly registry: EngineRun['registry'];
  readonly dropped: EngineRun['dropped'];
}

const cases = fixture.cases as unknown as readonly Case[];

function load(name: string): { script: string; run: EngineRun } {
  const found = cases.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no captured case named ${name}`);

  const { result, hostCalls, registry, dropped } = found;
  return { script: found.script, run: { result, hostCalls, registry, dropped } };
}

describe('the captured fixture', () => {
  it('covers the shapes the adapter has to handle', () => {
    expect(cases.map((c) => c.name)).toEqual([
      'layered-iex',
      'dropper',
      'pinvoke-declaration',
      'budget-exhausted',
      'tamper',
    ]);
  });

  it('only ever carries canonical ops', () => {
    // The guard that catches vocabulary drift between the two builds. It has
    // already caught one: the engine emitted `network.client` for
    // `New-Object Net.WebClient`, an op that existed nowhere else.
    for (const sample of cases) {
      for (const call of sample.hostCalls) {
        expect(isHostOp(call.op), `${sample.name}: ${call.op} from ${call.native}`).toBe(true);
      }
    }
  });
});

describe('adaptRun', () => {
  it('keeps the pasted input as layer 0 and the IEX text as layer 1', () => {
    const { script, run } = load('layered-iex');
    const { trace } = adaptRun(script, run);

    expect(trace.layers[0].source).toBe(script);
    expect(trace.layers[0].origin.via).toBe('input');
    expect(trace.layers[1].source).toBe('Write-Host "hello husk"');
    expect(trace.layers[1].origin).toMatchObject({ via: 'invoke', from: 0 });
  });

  it('reads a whole dropper off one run', () => {
    // Download, drop, persist, launch. This is the case the engine exists for.
    const { script, run } = load('dropper');
    const analysis = adaptRun(script, run);

    const ops = analysis.trace.events.map((e) => e.op);
    expect(ops).toContain('network.download');
    expect(ops).toContain('filesystem.write');
    expect(ops).toContain('registry.write');
    expect(ops).toContain('process.start');

    const download = analysis.trace.events.find((e) => e.op === 'network.download')!;
    expect(download.args[0]).toBe('http://evil.test/stage2.ps1');
    expect(download.category).toBe('network');
  });

  it('names the file the sample dropped by the path the sample used', () => {
    // The engine stores it under its virtual C: root, which is not what the
    // sample wrote and not what an analyst should be shown.
    const { script, run } = load('dropper');
    const [file] = adaptRun(script, run).dropped;

    expect(file.path).toBe('C:\\Users\\Public\\note.txt');
    expect(file.enginePath).toBe('/husk-c/Users/Public/note.txt');
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(file.size).toBeGreaterThan(0);
  });

  it('reports the Run-key write and none of the seeded values', () => {
    // 11 of the 12 populated values in that dump are Husk's own scaffolding.
    const { script, run } = load('dropper');
    const writes = adaptRun(script, run).registryWrites;

    expect(writes).toHaveLength(1);
    expect(writes[0].key).toBe(
      'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    );
    expect(writes[0].name).toBe('Updater');
    // The persistence value names the file dropped earlier in the same run.
    expect(writes[0].value).toContain('Updater.ps1');
  });

  it('keeps the capture layer on every event', () => {
    // A proxy record is script-reachable and therefore forgeable; a provider
    // record is the write as it happened. Collapsing them hides that.
    const { script, run } = load('dropper');
    const byOrigin = new Map(
      adaptRun(script, run).trace.events.map((e) => [e.signature, e.origin]),
    );

    expect(byOrigin.get('Net.WebClient.DownloadFile')).toBe('proxy');
    expect(byOrigin.get('Set-ItemProperty')).toBe('cmdlet');
    expect(byOrigin.get('Registry::SetProperty')).toBe('provider');
  });

  it('records both the intent and the effect of one registry write', () => {
    // Deliberately not deduplicated: the cmdlet record has the parameters as
    // the sample wrote them, the provider record has the path resolved, and
    // those differ whenever the path is computed.
    const { script, run } = load('dropper');
    const writes = adaptRun(script, run).trace.events.filter((e) => e.op === 'registry.write');

    expect(writes.map((e) => e.origin)).toEqual(['cmdlet', 'provider']);
    expect(writes[0].args[0]).toContain('HKCU:');
    expect(writes[1].args[0]).toContain('HKEY_CURRENT_USER');
  });

  it('keeps a P/Invoke declaration that could never run', () => {
    // Add-Type cannot work in a browser. The C# and the API it names are the
    // evidence, and in malware that is nearly always the point of the call.
    const { script, run } = load('pinvoke-declaration');
    const events = adaptRun(script, run).trace.events;

    expect(events.map((e) => e.op)).toEqual(['assembly.define-type', 'assembly.pinvoke']);
    expect(events[0].args[0]).toContain('VirtualAlloc');
    expect(events[1].args[0]).toBe('kernel32.dll');
  });

  it('calls a budget stop a partial result, not an error', () => {
    const { script, run } = load('budget-exhausted');
    const analysis = adaptRun(script, run);

    expect(analysis.stoppedBy).toBe('time budget exhausted after 10000 ms');
    expect(analysis.error).toBeUndefined();
  });

  it('surfaces an attempt to turn the sandbox off as an indicator', () => {
    const { script, run } = load('tamper');
    const events = adaptRun(script, run).trace.events;

    expect(events.every((e) => e.op === 'evasion.sandbox')).toBe(true);
    expect(events.every((e) => e.category === 'evasion')).toBe(true);
    expect(events[0].args[0]).toContain('sealed');
  });

  it('carries only the registry values this sample wrote, not the last one’s', () => {
    // The store is static inside the engine, so one instance used to carry a
    // sample's writes into the next sample's report. Every case after the
    // dropper came back owning its Run-key value.
    for (const name of ['pinvoke-declaration', 'budget-exhausted', 'tamper']) {
      const { script, run } = load(name);
      expect(adaptRun(script, run).registryWrites, name).toEqual([]);
    }
  });

  it('reports an op it does not know as a gap rather than dropping it', () => {
    const { script, run } = load('dropper');
    const drifted: EngineRun = {
      ...run,
      hostCalls: [
        ...run.hostCalls,
        { seq: 99, op: 'filesystem.exfiltrate', native: 'Nonsense', args: [], source: 'binder' },
      ],
    };

    const analysis = adaptRun(script, drifted);
    const gaps = analysis.trace.gaps.ranked();

    expect(gaps).toHaveLength(1);
    expect(gaps[0].detail).toContain('filesystem.exfiltrate');
    expect(gaps[0].detail).toContain('drifted');
    // And it is not silently counted as an indicator.
    expect(analysis.trace.events.some((e) => e.signature === 'Nonsense')).toBe(false);
  });

  it('orders events by the engine sequence, not by arrival', () => {
    const { script, run } = load('dropper');
    const shuffled: EngineRun = { ...run, hostCalls: [...run.hostCalls].reverse() };

    const forward = adaptRun(script, run).trace.events.map((e) => e.signature);
    expect(adaptRun(script, shuffled).trace.events.map((e) => e.signature)).toEqual(forward);
  });
});

describe('toWindowsPath', () => {
  it('maps the virtual root back to C:', () => {
    expect(toWindowsPath('/husk-c/Users/Public/a.exe')).toBe('C:\\Users\\Public\\a.exe');
    expect(toWindowsPath('/husk-c')).toBe('C:\\');
  });

  it('leaves a path that was never under the root alone', () => {
    // .NET calls do not go through PowerShell drives, so a sample that calls
    // [IO.File]::WriteAllText("C:\x") creates a literal filename instead.
    expect(toWindowsPath('C:\\Users\\Public\\a.ps1')).toBe('C:\\Users\\Public\\a.ps1');
    expect(toWindowsPath('/pshome/Modules')).toBe('/pshome/Modules');
  });
});
