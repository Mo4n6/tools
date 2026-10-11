// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import { describe, expect, it } from 'vitest';

import { psString } from '../../core/value';
import { allHostOps, categoryOf, isHostOp } from '../ops';
import {
  allSurfaces,
  findMember,
  findSurface,
  type SurfaceCall,
  type SurfaceContext,
} from '../surfaces';

function harness(): { ctx: SurfaceContext; calls: SurfaceCall[]; gaps: string[] } {
  const calls: SurfaceCall[] = [];
  const gaps: string[] = [];
  return {
    calls,
    gaps,
    ctx: {
      record: (call) => calls.push(call),
      gap: (signature) => gaps.push(signature),
    },
  };
}

describe('host ops', () => {
  it('builds every op as category.name', () => {
    for (const op of allHostOps()) {
      expect(op).toMatch(/^[a-z]+\.[a-z-]+$/);
      expect(isHostOp(op)).toBe(true);
      expect(op.startsWith(`${categoryOf(op)}.`)).toBe(true);
    }
  });

  it('rejects an op that is not in the table', () => {
    // Guards data that crossed a worker boundary or a saved report.
    expect(isHostOp('filesystem.exfiltrate')).toBe(false);
    expect(isHostOp('nonsense')).toBe(false);
  });
});

describe('surface registry', () => {
  it('resolves ProgIDs case-insensitively, as COM does', () => {
    expect(findSurface('WScript.Shell')?.typeName).toBe('WScript.Shell');
    expect(findSurface('wscript.shell')?.typeName).toBe('WScript.Shell');
    expect(findSurface('  WSCRIPT.SHELL  ')?.typeName).toBe('WScript.Shell');
  });

  it('resolves version-suffixed and legacy spellings to one surface', () => {
    // Droppers pick whichever ProgID happens to be registered.
    const names = [
      'MSXML2.XMLHTTP',
      'MSXML2.XMLHTTP.6.0',
      'MSXML2.ServerXMLHTTP',
      'Microsoft.XMLHTTP',
      'WinHttp.WinHttpRequest.5.1',
    ];
    for (const name of names) {
      expect(findSurface(name)?.typeName, name).toBe('MSXML2.XMLHTTP');
    }
  });

  it('returns undefined for an unknown surface rather than throwing', () => {
    // Unknown must be a recordable absence; the caller turns it into a gap.
    expect(findSurface('Totally.Unknown.ProgID')).toBeUndefined();
  });

  it('declares only ops that exist', () => {
    for (const surface of allSurfaces()) {
      for (const member of surface.members) {
        if (member.op !== undefined) {
          expect(isHostOp(member.op), `${surface.typeName}.${member.name}`).toBe(true);
        }
      }
    }
  });
});

describe('surface behaviour', () => {
  it('records process.start for WScript.Shell.Run', () => {
    const { ctx, calls } = harness();
    const surface = findSurface('WScript.Shell')!;
    const run = findMember(surface, 'Run')!;

    run.call!(ctx, [psString('powershell -enc ZQBj')]);

    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe('process.start');
    expect(calls[0].nativeSignature).toBe('WScript.Shell.Run');
    expect(calls[0].args[0]).toMatchObject({ kind: 'string', value: 'powershell -enc ZQBj' });
  });

  it('normalises three different file writes onto one op', () => {
    // The whole point of the canonical vocabulary: one timeline, not three.
    const cases: [string, string][] = [
      ['Scripting.FileSystemObject', 'CreateTextFile'],
      ['ADODB.Stream', 'SaveToFile'],
      ['ADODB.Stream', 'Write'],
    ];
    for (const [progId, memberName] of cases) {
      const { ctx, calls } = harness();
      const member = findMember(findSurface(progId)!, memberName)!;
      member.call!(ctx, [psString('C:\\Users\\Public\\a.exe')]);
      expect(calls[0]?.op, `${progId}.${memberName}`).toBe('filesystem.write');
    }
  });

  it('records a gap when it answers something it cannot know', () => {
    // RegRead has no virtual registry behind it yet. Execution continues, but
    // the answer must be flagged rather than passed off as a real value.
    const { ctx, calls, gaps } = harness();
    const member = findMember(findSurface('WScript.Shell')!, 'RegRead')!;

    const result = member.call!(ctx, [psString('HKCU\\Software\\X')]);

    expect(calls[0].op).toBe('registry.read');
    expect(gaps).toContain('WScript.Shell.RegRead value');
    expect(result.kind).toBe('null');
  });

  it('flags the stage-2 body as unretrieved rather than returning empty', () => {
    // An empty ResponseText that is not flagged reads as "the server sent
    // nothing", which is a different and wrong conclusion.
    const { ctx, gaps } = harness();
    const member = findMember(findSurface('MSXML2.XMLHTTP')!, 'ResponseText')!;

    member.call!(ctx, []);

    expect(gaps).toContain('XMLHTTP.ResponseText');
  });

  it('never throws on any registered member, whatever it is handed', () => {
    // Commitment 2: evaluation never aborts. A surface that throws on odd
    // arguments would take the whole run down.
    for (const surface of allSurfaces()) {
      for (const member of surface.members) {
        if (member.call === undefined) continue;
        const { ctx } = harness();
        expect(() => member.call!(ctx, []), `${surface.typeName}.${member.name} with no args`)
          .not.toThrow();
      }
    }
  });
});
