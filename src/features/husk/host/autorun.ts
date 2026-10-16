// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Promotes a write to a known autorun location into the persistence op it
// actually is.
//
// Three of the nine op families in ops.ts had no emitter at all — `persistence`,
// `wmi` and all of `evasion` but one. For persistence that was not a missing
// surface: the writes were already being recorded, as `registry.write` and
// `filesystem.copy`, with the full path in the argument. The engine knew a
// sample had set a value named Updater under `HKCU\…\CurrentVersion\Run`;
// nothing said that this particular registry write is how the sample survives
// a reboot.
//
// Husk renders one flat timeline tagged by category, so a write is promoted
// rather than recorded twice: `[persistence] Registry::SetProperty HKCU\…\Run`
// tells an analyst strictly more than `[registry]`, and the record still
// carries the path and the value, so nothing is lost. Recording both would put
// the same write in the timeline twice.
//
// This sits beside ops.ts rather than in the engine adapter because it is a
// property of the path, not of the backend: the tree-walker records the same
// writes through its own event path and can adopt it unchanged.

import type { HostOp } from './ops';

/**
 * Registry keys that run something at logon or boot.
 *
 * Matched as a suffix of the key path, so the hive and the Wow6432Node
 * redirection both fall out without being enumerated.
 *
 * These are exact keys, so the pattern is anchored at the end. Windows honours
 * the *values* under `…\CurrentVersion\Run` and ignores subkeys of it, so an
 * unanchored match would promote `New-Item …\Run\Foo` — which establishes
 * nothing — and every vendor key that happens to start with "Run".
 */
const AUTORUN_KEYS: readonly RegExp[] = [
  // T1547.001. RunOnceEx and the RunServices pair are 9x-era but still honoured,
  // and droppers copied from old forum posts still write them.
  /\\CurrentVersion\\Run$/i,
  /\\CurrentVersion\\RunOnce$/i,
  /\\CurrentVersion\\RunOnceEx(\\|$)/i,
  /\\CurrentVersion\\RunServices$/i,
  /\\CurrentVersion\\RunServicesOnce$/i,
  /\\CurrentVersion\\Policies\\Explorer\\Run$/i,
  // T1547.004: Winlogon's Shell and Userinit values, and the Windows key's
  // Load and Run values, all name a program the session starts.
  /\\Windows NT\\CurrentVersion\\Winlogon$/i,
  /\\Windows NT\\CurrentVersion\\Windows$/i,
  // T1546.012: a Debugger value here replaces the program it is named after.
  /\\Image File Execution Options(\\|$)/i,
];

/** T1543.003. A write under the services key installs or hijacks a service. */
const SERVICE_KEY = /\\CurrentControlSet\\Services(\\|$)/i;

/**
 * T1547.001's other half: a file dropped here is launched at logon.
 *
 * Both the per-user and the all-users folder end in the same two segments, so
 * one pattern covers them.
 */
const STARTUP_DIR = /\\Start Menu\\Programs\\Startup(\\|$)/i;

/**
 * Parameters that name where a write *lands*, per op.
 *
 * The distinction matters for copies and moves: the cmdlet hook renders bound
 * parameters as `name=value`, and `Copy-Item`'s `-Path` is the **source**. A
 * classifier that scanned every argument would promote a copy *out of* the
 * Startup folder, which is collection, not persistence.
 *
 * Registry writes have the same hazard from the other direction: the recorded
 * arguments are the key, the value name and the value, and a loader that
 * stores a Run-key path *as a value* somewhere else would be reported as
 * establishing persistence it has not established.
 */
const DESTINATION_PARAMS: Readonly<Record<string, readonly string[]>> = {
  'registry.write': ['path', 'literalpath'],
  'filesystem.copy': ['destination', 'newname'],
  'filesystem.move': ['destination', 'newname'],
  'filesystem.write': ['path', 'literalpath', 'filepath', 'outfile', 'destination'],
  'filesystem.append': ['path', 'literalpath', 'filepath', 'outfile', 'destination'],
};

/**
 * Splits `Destination=C:\x` into its parts, or returns a bare value as
 * positional.
 *
 * Cmdlet records are `name=value`, because the hook renders the bound
 * parameters; provider and proxy records are positional. Which of the two a
 * record is decides how `destinationPaths` reads it.
 */
function splitArg(arg: string): { name: string | undefined; value: string } {
  const eq = arg.indexOf('=');
  if (eq <= 0) return { name: undefined, value: arg };
  const name = arg.slice(0, eq);
  // A value containing '=' is common (base64, a query string). Only treat the
  // prefix as a parameter name when it looks like one.
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) return { name: undefined, value: arg };
  return { name: name.toLowerCase(), value: arg.slice(eq + 1) };
}

/**
 * Normalises a path for matching.
 *
 * The wasm filesystem reports `/` separators and the virtual registry reports
 * `\`, and a sample may write either; `Registry::` and provider qualification
 * are stripped so a key matches whichever way it was spelled. Trailing
 * separators go, because `…\Run\` and `…\Run` are the same key.
 */
function normalize(value: string): string {
  return value.replace(/\//g, '\\').replace(/^.*Registry::/i, '').replace(/\\+$/, '');
}

/**
 * The persistence op this write establishes, or the op unchanged.
 *
 * Reads are deliberately never promoted. Enumerating the Run key or stat-ing
 * the Startup folder is reconnaissance — plenty of benign software does it —
 * and tagging it `persistence` would make the category untrustworthy, which
 * costs more than the hits are worth.
 */
export function classifyAutorun(op: HostOp, args: readonly string[]): HostOp {
  const destinations = DESTINATION_PARAMS[op];
  if (!destinations) return op;

  for (const path of destinationPaths(args, destinations)) {
    if (op === 'registry.write') {
      if (SERVICE_KEY.test(path)) return 'persistence.service';
      if (AUTORUN_KEYS.some((pattern) => pattern.test(path))) return 'persistence.run-key';
    } else if (STARTUP_DIR.test(path)) {
      return 'persistence.startup-folder';
    }
  }

  return op;
}

/**
 * The normalised paths among these arguments that say where the write lands.
 *
 * A named argument qualifies by its parameter name. An unnamed one qualifies
 * only at index 0, which is where every positional record puts it: the
 * provider reports `(key, name, value)`, `WScript.Shell.RegWrite` reports
 * `(key, value)`, and a proxy that writes a file reports the file alone.
 */
function* destinationPaths(
  args: readonly string[],
  destinations: readonly string[],
): Generator<string> {
  for (let i = 0; i < args.length; i++) {
    const { name, value } = splitArg(args[i]);
    if (name === undefined ? i === 0 : destinations.includes(name)) {
      yield normalize(value);
    }
  }
}
