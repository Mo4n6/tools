// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Fake surfaces: the COM objects, WMI classes and .NET types a sample reaches
// for, modelled as data rather than as code.
//
// A surface answers calls plausibly enough that the script keeps running, and
// reports what it was asked to do in canonical ops. Nothing is performed.
//
// The design constraint is that adding coverage must be a table entry, not a
// code change, and that a surface we do not have is a *recorded* absence
// rather than a crash or a silent empty string. Execution never stops: a
// sample that calls something unknown keeps going with a tainted value, and
// the gap ledger says what was missing and what downstream depended on it.

import type { PSValue } from '../core/value';
import { psNull, psObject, psString } from '../core/value';
import type { HostOp } from './ops';

/** What a member call wants recorded, and what it hands back. */
export interface SurfaceCall {
  readonly op: HostOp;
  /** Resolved argument values, in declaration order. */
  readonly args: readonly PSValue[];
  /** What the sample actually wrote, for the analyst: 'WScript.Shell.Run'. */
  readonly nativeSignature: string;
}

/** Everything a member implementation is allowed to do. */
export interface SurfaceContext {
  /** Record a host call. Returns nothing; the fake decides what to hand back. */
  readonly record: (call: SurfaceCall) => void;
  /**
   * Note that we modelled something only approximately, so the result is not
   * trustworthy even though execution continued.
   */
  readonly gap: (signature: string, detail?: string) => void;
}

export type MemberKind = 'method' | 'property';

export interface SurfaceMember {
  readonly name: string;
  readonly kind: MemberKind;
  /**
   * Omitted for members that are pure computation or inert state — a
   * `FileSystemObject.GetBaseName` reads nothing and does nothing.
   */
  readonly op?: HostOp;
  /**
   * Implementation. Receives evaluated arguments; returns the value the script
   * sees. Defaults to a tainted null, which is the honest answer for a surface
   * whose return we cannot model.
   */
  readonly call?: (ctx: SurfaceContext, args: readonly PSValue[]) => PSValue;
}

export interface Surface {
  /** Canonical name, as the analyst should see it. */
  readonly typeName: string;
  /**
   * Every spelling that resolves here: ProgIDs, .NET type names, version-
   * suffixed variants. Matched case-insensitively, since COM ProgIDs are.
   */
  readonly aliases: readonly string[];
  readonly members: readonly SurfaceMember[];
}

const str = (value: PSValue | undefined): string =>
  value === undefined ? '' : value.kind === 'string' ? value.value : String(describe(value));

function describe(value: PSValue): string {
  switch (value.kind) {
    case 'string':
      return value.value;
    case 'number':
      return String(value.value);
    case 'bool':
      return value.value ? 'True' : 'False';
    case 'null':
      return '';
    default:
      return `[${value.kind}]`;
  }
}

/**
 * The first COM surfaces, chosen because they are what commodity droppers
 * actually instantiate. Ordered by how often they turn up.
 */
const COM_SURFACES: readonly Surface[] = [
  {
    typeName: 'WScript.Shell',
    aliases: ['WScript.Shell', 'WScript.Shell.1', 'Shell.Application'],
    members: [
      {
        name: 'Run',
        kind: 'method',
        op: 'process.start',
        call: (ctx, args) => {
          ctx.record({ op: 'process.start', args, nativeSignature: 'WScript.Shell.Run' });
          // Real Run returns the process exit code when told to wait.
          return psNull();
        },
      },
      {
        name: 'Exec',
        kind: 'method',
        op: 'process.start',
        call: (ctx, args) => {
          ctx.record({ op: 'process.start', args, nativeSignature: 'WScript.Shell.Exec' });
          // Exec returns a WshScriptExec whose .StdOut the script often reads.
          ctx.gap('WScript.Shell.Exec return value', 'StdOut/StdErr not modelled');
          return psObject('WshScriptExec');
        },
      },
      {
        name: 'RegWrite',
        kind: 'method',
        op: 'registry.write',
        call: (ctx, args) => {
          ctx.record({ op: 'registry.write', args, nativeSignature: 'WScript.Shell.RegWrite' });
          return psNull();
        },
      },
      {
        name: 'RegRead',
        kind: 'method',
        op: 'registry.read',
        call: (ctx, args) => {
          ctx.record({ op: 'registry.read', args, nativeSignature: 'WScript.Shell.RegRead' });
          // Unknown until the virtual registry lands; honest absence, tainted
          // by the caller so anything derived from it is flagged.
          ctx.gap('WScript.Shell.RegRead value', str(args[0]));
          return psNull();
        },
      },
      {
        name: 'RegDelete',
        kind: 'method',
        op: 'registry.delete',
        call: (ctx, args) => {
          ctx.record({ op: 'registry.delete', args, nativeSignature: 'WScript.Shell.RegDelete' });
          return psNull();
        },
      },
      {
        name: 'ExpandEnvironmentStrings',
        kind: 'method',
        call: (_ctx, args) => psString(str(args[0])),
      },
      {
        name: 'SpecialFolders',
        kind: 'property',
        call: () => psObject('WshSpecialFolders'),
      },
    ],
  },
  {
    typeName: 'Scripting.FileSystemObject',
    aliases: ['Scripting.FileSystemObject', 'Scripting.FileSystemObject.1'],
    members: [
      {
        name: 'CreateTextFile',
        kind: 'method',
        op: 'filesystem.write',
        call: (ctx, args) => {
          ctx.record({
            op: 'filesystem.write',
            args,
            nativeSignature: 'FileSystemObject.CreateTextFile',
          });
          return psObject('TextStream');
        },
      },
      {
        name: 'OpenTextFile',
        kind: 'method',
        op: 'filesystem.read',
        call: (ctx, args) => {
          ctx.record({
            op: 'filesystem.read',
            args,
            nativeSignature: 'FileSystemObject.OpenTextFile',
          });
          return psObject('TextStream');
        },
      },
      {
        name: 'DeleteFile',
        kind: 'method',
        op: 'filesystem.delete',
        call: (ctx, args) => {
          ctx.record({ op: 'filesystem.delete', args, nativeSignature: 'FileSystemObject.DeleteFile' });
          return psNull();
        },
      },
      {
        name: 'CopyFile',
        kind: 'method',
        op: 'filesystem.copy',
        call: (ctx, args) => {
          ctx.record({ op: 'filesystem.copy', args, nativeSignature: 'FileSystemObject.CopyFile' });
          return psNull();
        },
      },
      {
        name: 'FileExists',
        kind: 'method',
        op: 'filesystem.exists',
        call: (ctx, args) => {
          ctx.record({ op: 'filesystem.exists', args, nativeSignature: 'FileSystemObject.FileExists' });
          // Answering True keeps droppers on their happy path, which is the
          // path with the payload on it. Tainted by the caller regardless.
          ctx.gap('FileSystemObject.FileExists', 'answered optimistically');
          return psNull();
        },
      },
    ],
  },
  {
    typeName: 'MSXML2.XMLHTTP',
    aliases: [
      'MSXML2.XMLHTTP',
      'MSXML2.XMLHTTP.6.0',
      'MSXML2.ServerXMLHTTP',
      'MSXML2.ServerXMLHTTP.6.0',
      'Microsoft.XMLHTTP',
      'WinHttp.WinHttpRequest.5.1',
    ],
    members: [
      {
        name: 'Open',
        kind: 'method',
        op: 'network.http',
        call: (ctx, args) => {
          ctx.record({ op: 'network.http', args, nativeSignature: 'XMLHTTP.Open' });
          return psNull();
        },
      },
      {
        name: 'Send',
        kind: 'method',
        op: 'network.upload',
        call: (ctx, args) => {
          ctx.record({ op: 'network.upload', args, nativeSignature: 'XMLHTTP.Send' });
          return psNull();
        },
      },
      {
        name: 'ResponseText',
        kind: 'property',
        call: (ctx) => {
          // The stage-2 body. Unknowable on the locked page; this is where the
          // live page will substitute a real response.
          ctx.gap('XMLHTTP.ResponseText', 'remote stage not retrieved');
          return psNull();
        },
      },
      { name: 'ResponseBody', kind: 'property', call: (ctx) => {
        ctx.gap('XMLHTTP.ResponseBody', 'remote stage not retrieved');
        return psNull();
      } },
      { name: 'SetRequestHeader', kind: 'method', call: () => psNull() },
      { name: 'Status', kind: 'property', call: () => psNull() },
    ],
  },
  {
    typeName: 'ADODB.Stream',
    aliases: ['ADODB.Stream'],
    members: [
      { name: 'Open', kind: 'method', call: () => psNull() },
      {
        name: 'Write',
        kind: 'method',
        op: 'filesystem.write',
        call: (ctx, args) => {
          ctx.record({ op: 'filesystem.write', args, nativeSignature: 'ADODB.Stream.Write' });
          return psNull();
        },
      },
      {
        name: 'SaveToFile',
        kind: 'method',
        op: 'filesystem.write',
        call: (ctx, args) => {
          ctx.record({ op: 'filesystem.write', args, nativeSignature: 'ADODB.Stream.SaveToFile' });
          return psNull();
        },
      },
      { name: 'Close', kind: 'method', call: () => psNull() },
    ],
  },
];

/** Normalised for lookup: ProgIDs are case-insensitive. */
const normalise = (name: string): string => name.trim().toLowerCase();

const BY_ALIAS: ReadonlyMap<string, Surface> = (() => {
  const map = new Map<string, Surface>();
  for (const surface of COM_SURFACES) {
    for (const alias of surface.aliases) {
      const key = normalise(alias);
      // A duplicate alias is a table bug, not a runtime condition. Fail at
      // module load rather than silently resolving to whichever came last.
      if (map.has(key)) {
        throw new Error(`duplicate surface alias: ${alias}`);
      }
      map.set(key, surface);
    }
  }
  return map;
})();

export function findSurface(name: string): Surface | undefined {
  return BY_ALIAS.get(normalise(name));
}

export function findMember(surface: Surface, name: string): SurfaceMember | undefined {
  const wanted = normalise(name);
  return surface.members.find((m) => normalise(m.name) === wanted);
}

/** Every registered surface, for the coverage test and the UI's capability list. */
export function allSurfaces(): readonly Surface[] {
  return COM_SURFACES;
}
