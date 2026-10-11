// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// The launcher command line.
//
// A sample rarely arrives as a clean script. It arrives as the command line a
// parent process was seen running — out of a Sysmon event, an EDR alert, a
// scheduled task action, a Run key value — and the script is somewhere inside
// it, behind an executable name, a pile of abbreviated switches, maybe base64,
// and whatever quoting the shell that produced it needed.
//
// Getting this wrong is not a cosmetic problem. Measured against the corpus
// through the wasm engine, unhandled cmd.exe escaping alone cost five
// fixtures: the engine was handed literal backslashes and ended up trying to
// run a command named `\[\`.
//
// What was unwrapped is itself evidence, so this reports it rather than
// quietly normalising. `-w hidden -nop -ep bypass` is a sentence about intent,
// and an analyst should see it spelled out even though none of it changes what
// the script does.

/** A switch as the sample spelled it, and what it actually means. */
export interface LauncherSwitch {
  /** Exactly as written, including its prefix: -nop, /c, -EncodedCommand. */
  readonly spelling: string;
  /** The canonical name, or undefined when no single switch matches. */
  readonly canonical?: string;
  /** The value, for the switches that take one. */
  readonly value?: string;
}

export type LauncherQuoting = 'none' | 'single' | 'double' | 'cmd';

export interface LauncherParse {
  /** False when the input is already a script; everything else is then empty. */
  readonly isLauncher: boolean;
  /** As written: powershell.exe, pwsh, or a full path to either. */
  readonly executable?: string;
  readonly switches: readonly LauncherSwitch[];
  /** Set when the script arrived base64-encoded, via -EncodedCommand. */
  readonly encoding?: 'base64-utf16le';
  readonly quoting: LauncherQuoting;
  /** The script to analyse. The input unchanged when this is not a launcher. */
  readonly script: string;
  /** What could not be parsed, in the analyst's words rather than a stack. */
  readonly notes: readonly string[];
}

/**
 * The switches powershell.exe and pwsh accept, and whether each takes a value.
 * Order matters: a prefix that could match several resolves to the first,
 * which is how the real parser behaves for the cases droppers rely on.
 */
const SWITCHES: readonly { readonly name: string; readonly takesValue: boolean }[] = [
  // -e and -ec are EncodedCommand even though ExecutionPolicy also starts
  // with an e, so EncodedCommand has to come first.
  { name: 'EncodedCommand', takesValue: true },
  { name: 'ExecutionPolicy', takesValue: true },
  { name: 'Command', takesValue: true },
  { name: 'File', takesValue: true },
  { name: 'WindowStyle', takesValue: true },
  { name: 'NoProfile', takesValue: false },
  { name: 'NonInteractive', takesValue: false },
  { name: 'NoLogo', takesValue: false },
  { name: 'NoExit', takesValue: false },
  { name: 'InputFormat', takesValue: true },
  { name: 'OutputFormat', takesValue: true },
  { name: 'Version', takesValue: true },
  { name: 'PSConsoleFile', takesValue: true },
  { name: 'ConfigurationName', takesValue: true },
  { name: 'SettingsFile', takesValue: true },
  { name: 'Sta', takesValue: false },
  { name: 'Mta', takesValue: false },
  { name: 'NoProfileLoadTime', takesValue: false },
  { name: 'Help', takesValue: false },
];

/**
 * Spellings the real parser treats specially, where plain prefix matching
 * would give the wrong answer or no answer.
 */
const ALIASES: ReadonlyMap<string, string> = new Map([
  ['ep', 'ExecutionPolicy'],
  ['nop', 'NoProfile'],
  ['noni', 'NonInteractive'],
  ['nol', 'NoLogo'],
  ['noe', 'NoExit'],
  ['w', 'WindowStyle'],
  ['win', 'WindowStyle'],
  ['c', 'Command'],
  ['f', 'File'],
  ['?', 'Help'],
  ['h', 'Help'],
  // Bare -bypass is not a switch at all, but it turns up constantly as a
  // shorthand for -ExecutionPolicy Bypass and is worth naming.
  ['bypass', 'ExecutionPolicy'],
]);

const EXECUTABLE = new RegExp(
  String.raw`^\s*"?((?:[a-z]:[\\/][^"\s]*[\\/])?(?:powershell(?:\.exe)?|pwsh(?:\.exe)?))"?\s*`,
  'i',
);

const SWITCH_TOKEN = /^[-/][^\s:=]*/;
const SWITCH_VALUE = /^(?:"[^"]*"|'[^']*'|\S+)/;

function resolveSwitch(spelling: string): { canonical?: string; takesValue: boolean } {
  const bare = spelling.replace(/^[-/]+/, '').toLowerCase();

  const alias = ALIASES.get(bare);
  if (alias !== undefined) {
    const entry = SWITCHES.find((candidate) => candidate.name === alias);
    return { canonical: alias, takesValue: entry?.takesValue ?? false };
  }

  const match = SWITCHES.find((candidate) => candidate.name.toLowerCase().startsWith(bare));
  if (match === undefined) {
    // An unknown switch is reported, not dropped: it might be the thing that
    // explains why the sample behaved differently than the report says.
    return { takesValue: false };
  }

  return { canonical: match.name, takesValue: match.takesValue };
}

/**
 * Strips one layer of quoting from the script, and cmd.exe's escaping with it.
 *
 * cmd escapes a quote as \" and anything it would otherwise act on — a pipe, a
 * redirect, an ampersand — as ^X. Those escapes are consumed by cmd before
 * PowerShell sees them, so a command line captured from a parent cmd.exe still
 * carries them and the script inside is not yet the script that ran.
 */
function unquote(raw: string): { script: string; quoting: LauncherQuoting } {
  const text = raw.trim();

  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return { script: text.slice(1, -1), quoting: 'single' };
  }

  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    const inner = text.slice(1, -1);
    const unescaped = inner.replace(/\\"/g, '"').replace(/\^([|&<>^()"])/g, '$1');
    return { script: unescaped, quoting: unescaped === inner ? 'double' : 'cmd' };
  }

  return { script: text, quoting: 'none' };
}

/** Base64 to UTF-16LE text, which is what -EncodedCommand carries. */
function decodeEncodedCommand(value: string): string | undefined {
  const cleaned = value.replace(/\s+/g, '');
  if (cleaned.length === 0) return undefined;

  try {
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-16le').decode(bytes);
  } catch {
    return undefined;
  }
}

const notALauncher = (source: string): LauncherParse => ({
  isLauncher: false,
  switches: [],
  quoting: 'none',
  script: source,
  notes: [],
});

/**
 * Takes a launcher command line and returns the script inside it.
 *
 * Input that is already a script comes back unchanged with `isLauncher` false,
 * so this is safe to run over everything.
 */
export function parseLauncher(source: string): LauncherParse {
  const executableMatch = EXECUTABLE.exec(source);
  if (executableMatch === null) {
    return notALauncher(source);
  }

  const executable = executableMatch[1];
  let rest = source.slice(executableMatch[0].length);
  const switches: LauncherSwitch[] = [];
  const notes: string[] = [];
  let encoding: 'base64-utf16le' | undefined;
  let script: string | undefined;
  let quoting: LauncherQuoting = 'none';

  while (rest.length > 0) {
    const trimmed = rest.replace(/^\s+/, '');
    if (trimmed.length === 0) break;

    if (!trimmed.startsWith('-') && !trimmed.startsWith('/')) {
      // Everything left is the script. powershell.exe treats a bare trailing
      // argument as -Command, which is how most droppers are written.
      ({ script, quoting } = unquote(trimmed));
      break;
    }

    const token = SWITCH_TOKEN.exec(trimmed)?.[0] ?? trimmed;
    const resolved = resolveSwitch(token);
    rest = trimmed.slice(token.length).replace(/^[\s:=]+/, '');

    if (resolved.canonical === undefined) {
      notes.push(`unrecognised switch ${token}`);
      switches.push({ spelling: token });
      continue;
    }

    if (!resolved.takesValue) {
      switches.push({ spelling: token, canonical: resolved.canonical });
      continue;
    }

    // -Command and -File take everything that follows; the rest take one word.
    if (resolved.canonical === 'Command' || resolved.canonical === 'File') {
      ({ script, quoting } = unquote(rest));
      switches.push({ spelling: token, canonical: resolved.canonical, value: script });
      break;
    }

    const value = SWITCH_VALUE.exec(rest)?.[0] ?? '';
    rest = rest.slice(value.length);
    const bare = value.replace(/^['"]/, '').replace(/['"]$/, '');
    switches.push({ spelling: token, canonical: resolved.canonical, value: bare });

    if (resolved.canonical === 'EncodedCommand') {
      const decoded = decodeEncodedCommand(bare);
      if (decoded === undefined) {
        notes.push(`${token} value is not valid base64`);
      } else {
        script = decoded;
        encoding = 'base64-utf16le';
        quoting = 'none';
      }
    }
  }

  if (script === undefined) {
    // A launcher with no script in it: -File pointing at a path we do not
    // have, or a command line truncated where it was captured.
    notes.push('no script found in the launcher');
    return { isLauncher: true, executable, switches, encoding, quoting, script: '', notes };
  }

  return { isLauncher: true, executable, switches, encoding, quoting, script, notes };
}

/** One line for the report: what the launcher said, in plain words. */
export function describeLauncher(parse: LauncherParse): string | undefined {
  if (!parse.isLauncher) return undefined;

  const parts = [parse.executable ?? 'powershell'];
  for (const entry of parse.switches) {
    parts.push(entry.canonical === undefined ? `${entry.spelling} (unrecognised)` : entry.canonical);
    const carriesScript = entry.canonical === 'Command' || entry.canonical === 'File';
    if (entry.value !== undefined && !carriesScript) parts.push(entry.value);
  }

  if (parse.encoding !== undefined) parts.push('(base64 UTF-16LE)');
  if (parse.quoting === 'cmd') parts.push('(cmd.exe escaping)');
  return parts.join(' ');
}
