// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// The canonical vocabulary of things a sample can try to do to a machine.
//
// Every fake surface — a COM object, a .NET type, a cmdlet — reports what it
// did in these terms rather than in its own. `Out-File`, `[IO.File]::
// WriteAllText`, VBScript's `FileSystemObject.CreateTextFile` and Python's
// `open(..., 'w')` all record `fs.write`.
//
// That indirection is the whole point. The analyst reads one timeline instead
// of five dialects, detection content is written against one vocabulary, and a
// new language front-end inherits the entire reporting layer by emitting ops
// that already exist.

/** The nine families, matching host/stubs.ts so the two can converge. */
export type HostCategory =
  | 'network'
  | 'process'
  | 'filesystem'
  | 'registry'
  | 'persistence'
  | 'assembly'
  | 'wmi'
  | 'evasion'
  | 'timing';

export const HOST_OPS = {
  filesystem: ['read', 'write', 'append', 'delete', 'copy', 'move', 'mkdir', 'list', 'exists'],
  registry: ['read', 'write', 'delete', 'enumerate'],
  process: ['start', 'shell', 'kill', 'list'],
  network: ['resolve', 'connect', 'http', 'download', 'upload', 'listen'],
  persistence: ['run-key', 'scheduled-task', 'service', 'wmi-subscription', 'startup-folder'],
  assembly: ['load', 'define-type', 'pinvoke', 'alloc-exec'],
  wmi: ['query', 'invoke', 'subscribe'],
  evasion: ['amsi', 'etw', 'defender', 'vm-check', 'debugger-check'],
  timing: ['sleep', 'kill-date'],
} as const satisfies Record<HostCategory, readonly string[]>;

type OpsOf<C extends HostCategory> = (typeof HOST_OPS)[C][number];

/** e.g. 'fs.write' is spelled 'filesystem.write'; one string, easy to grep. */
export type HostOp = {
  [C in HostCategory]: `${C}.${OpsOf<C>}`;
}[HostCategory];

const ALL_OPS: ReadonlySet<string> = new Set(
  (Object.entries(HOST_OPS) as [HostCategory, readonly string[]][]).flatMap(([category, ops]) =>
    ops.map((op) => `${category}.${op}`),
  ),
);

/**
 * Guard for data that crossed a boundary — a worker message, a saved report.
 * A surface table typo should fail loudly rather than produce an op nothing
 * downstream knows how to render.
 */
export function isHostOp(value: string): value is HostOp {
  return ALL_OPS.has(value);
}

export function categoryOf(op: HostOp): HostCategory {
  return op.slice(0, op.indexOf('.')) as HostCategory;
}

/** Every op, for exhaustiveness tests and for the UI's filter list. */
export function allHostOps(): readonly HostOp[] {
  return [...ALL_OPS].sort() as readonly HostOp[];
}
