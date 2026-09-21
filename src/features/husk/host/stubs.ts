// Host stubs: the constructs Husk recognises but will never perform.
//
// Every one of these is recorded as STUB_BY_DESIGN rather than GAP. That
// distinction matters (spec section 7): a stub is working as intended and
// must never appear in the implementation queue, while a GAP is work to do.
// Conflating them makes the report noise.
//
// Their arguments are the highest-value IOCs in a sample - a stage-2 URL is
// an argument to DownloadString, not something matched out of prose.

import type { Trace } from '../core/trace';
import { CLEAN } from '../core/taint';
import type { Layer } from '../core/trace';

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

interface StubRule {
  readonly category: HostCategory;
  readonly signature: string;
  readonly pattern: RegExp;
  /** Which capture groups are the interesting arguments. */
  readonly args?: readonly number[];
}

const RULES: readonly StubRule[] = [
  // --- Network ---
  {
    category: 'network',
    signature: 'Net.WebClient.DownloadString',
    pattern: /\.DownloadString\s*\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
    args: [1],
  },
  {
    category: 'network',
    signature: 'Net.WebClient.DownloadFile',
    pattern: /\.DownloadFile\s*\(\s*['"]?([^'",)]+)['"]?\s*,\s*['"]?([^'")]+)['"]?\s*\)/gi,
    args: [1, 2],
  },
  {
    category: 'network',
    signature: 'Net.WebClient.DownloadData',
    pattern: /\.DownloadData\s*\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
    args: [1],
  },
  {
    category: 'network',
    signature: 'Net.WebClient.UploadString',
    pattern: /\.UploadString\s*\(\s*['"]?([^'",)]+)['"]?/gi,
    args: [1],
  },
  {
    category: 'network',
    signature: 'Invoke-WebRequest',
    pattern: /\b(?:Invoke-WebRequest|iwr|curl|wget)\b[^\n;|]{0,200}/gi,
  },
  {
    category: 'network',
    signature: 'Invoke-RestMethod',
    pattern: /\b(?:Invoke-RestMethod|irm)\b[^\n;|]{0,200}/gi,
  },
  {
    category: 'network',
    signature: 'Net.Sockets.TCPClient',
    pattern: /\bNet\.Sockets\.TCPClient\b[^\n;|]{0,160}/gi,
  },
  {
    category: 'network',
    signature: 'Start-BitsTransfer',
    pattern: /\bStart-BitsTransfer\b[^\n;|]{0,200}/gi,
  },

  // --- Process ---
  {
    category: 'process',
    signature: 'Start-Process',
    pattern: /\b(?:Start-Process|saps)\b[^\n;|]{0,200}/gi,
  },
  {
    category: 'process',
    signature: 'Diagnostics.Process.Start',
    pattern: /\[?Diagnostics\.Process\]?::Start\s*\([^)]{0,200}\)/gi,
  },
  {
    category: 'process',
    signature: 'Invoke-Item',
    pattern: /\b(?:Invoke-Item|ii)\b[^\n;|]{0,160}/gi,
  },

  // --- Assembly and native code ---
  {
    category: 'assembly',
    signature: 'Reflection.Assembly::Load',
    pattern: /\[?Reflection\.Assembly\]?::Load[A-Za-z]*\s*\(/gi,
  },
  {
    category: 'assembly',
    signature: 'Add-Type',
    pattern: /\bAdd-Type\b[^\n;]{0,240}/gi,
  },
  {
    category: 'assembly',
    signature: 'Runtime.InteropServices.Marshal',
    pattern: /\[?Runtime\.InteropServices\.Marshal\]?::[A-Za-z]+/gi,
  },
  {
    category: 'assembly',
    signature: 'VirtualAlloc',
    pattern: /\bVirtualAlloc(?:Ex)?\b/gi,
  },
  {
    category: 'assembly',
    signature: 'CreateThread',
    pattern: /\bCreateThread\b|\bCreateRemoteThread\b/gi,
  },

  // --- Persistence ---
  {
    category: 'persistence',
    signature: 'Registry Run key',
    pattern:
      /(?:Set|New)-ItemProperty\b[^\n;|]{0,240}|(?:HKCU|HKLM)[:\\][^\s"']*\\Run\b[^\s"']*/gi,
  },
  {
    category: 'persistence',
    signature: 'schtasks',
    pattern: /\bschtasks(?:\.exe)?\b[^\n;|]{0,240}/gi,
  },
  {
    category: 'persistence',
    signature: 'Register-ScheduledTask',
    pattern: /\bRegister-ScheduledTask\b[^\n;|]{0,240}/gi,
  },
  {
    category: 'persistence',
    signature: 'New-Service',
    pattern: /\bNew-Service\b[^\n;|]{0,240}/gi,
  },

  // --- Filesystem ---
  {
    category: 'filesystem',
    signature: 'file write',
    pattern: /\b(?:Out-File|Set-Content|Add-Content|New-Item)\b[^\n;|]{0,200}/gi,
  },
  {
    category: 'filesystem',
    signature: 'IO.File::WriteAllBytes',
    pattern: /\[?IO\.File\]?::Write[A-Za-z]*\s*\(/gi,
  },

  // --- Registry ---
  {
    category: 'registry',
    signature: 'registry access',
    pattern: /\b(?:Get|Set|New|Remove)-Item(?:Property)?\b[^\n;|]{0,160}HK(?:LM|CU|CR|U|CC)[^\n;|]{0,160}/gi,
  },

  // --- WMI ---
  {
    category: 'wmi',
    signature: 'WMI query',
    pattern: /\b(?:Get-WmiObject|Get-CimInstance|Invoke-WmiMethod|Invoke-CimMethod|gwmi)\b[^\n;|]{0,200}/gi,
  },

  // --- Evasion ---
  {
    category: 'evasion',
    signature: 'AMSI bypass',
    pattern: /amsiInitFailed|AmsiScanBuffer|AmsiUtils/gi,
  },
  {
    category: 'evasion',
    signature: 'ETW patch',
    pattern: /EtwEventWrite|ScriptBlockLogging/gi,
  },
  {
    category: 'evasion',
    signature: 'ExecutionPolicy bypass',
    pattern: /-(?:ex|exec|executionpolicy)\s+bypass\b/gi,
  },
  {
    category: 'evasion',
    signature: 'hidden window',
    pattern: /-(?:w|windowstyle)\s+hidden\b/gi,
  },

  // --- Timing ---
  {
    category: 'timing',
    signature: 'Start-Sleep',
    pattern: /\bStart-Sleep\b[^\n;|]{0,80}/gi,
  },
];

const trim = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, 240);

/**
 * Scan one layer and record everything Husk recognises but will not perform.
 *
 * Each match becomes a trace event, whose arguments the IOC extractor reads,
 * plus a STUB_BY_DESIGN record so the fidelity report shows what was skipped
 * without putting it in the implementation queue.
 */
export function scanHostCalls(layer: Layer, trace: Trace): void {
  const seen = new Set<string>();

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of layer.source.matchAll(rule.pattern)) {
      const whole = trim(match[0]);
      const key = `${rule.signature}\u0000${whole}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const args = (rule.args ?? [])
        .map((i) => match[i])
        .filter((a): a is string => typeof a === 'string' && a.length > 0)
        .map(trim);

      trace.addEvent({
        provenance: { layer: layer.index, offset: match.index ?? 0 },
        category: rule.category,
        signature: rule.signature,
        args: args.length > 0 ? args : [whole],
        taint: CLEAN,
      });

      trace.gaps.report({
        kind: 'STUB_BY_DESIGN',
        signature: rule.signature,
        argTypes: [],
        provenance: { layer: layer.index, offset: match.index ?? 0 },
        detail: 'recorded, never performed',
      });
    }
  }
}

/** Scan every layer of a completed trace. */
export function scanAllLayers(trace: Trace): void {
  for (const layer of trace.layers) scanHostCalls(layer, trace);
}
