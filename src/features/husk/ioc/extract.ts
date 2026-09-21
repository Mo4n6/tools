// IOC extraction across every decoded layer.
//
// This runs over the whole trace, not just the final stage, because a sample
// that only partially unwraps still yields the indicators from the layers it
// did reach - and the stage-2 URL usually surfaces early. That is what makes
// the tool useful well below full deobfuscation coverage.

import type { Layer, Trace } from '../core/trace';
import { defang } from './defang';
import type { Ioc, IocConfidence, IocKind, IocReport } from './types';

interface Rule {
  readonly kind: IocKind;
  readonly pattern: RegExp;
  readonly confidence: IocConfidence;
  /** Rejects matches that fit the shape but are not indicators. */
  readonly reject?: (value: string, context: string) => boolean;
  /** Normalizes before deduplication. */
  readonly normalize?: (value: string) => string;
}

/** Hosts that appear in obfuscation scaffolding rather than as targets. */
const BENIGN_HOSTS = new Set([
  'microsoft.com',
  'schemas.microsoft.com',
  'www.w3.org',
  'schemas.xmlsoap.org',
  'go.microsoft.com',
  'localhost',
]);

/** File extensions that make a bare token a plausible path rather than prose. */
const PATH_EXTENSIONS =
  /\.(exe|dll|ps1|psm1|bat|cmd|vbs|js|jse|wsf|hta|scr|com|pif|zip|rar|7z|dat|bin|tmp|log|txt|doc[xm]?|xls[xmb]?|pdf)$/i;

const RULES: readonly Rule[] = [
  {
    kind: 'url',
    pattern: /\b(?:https?|ftp):\/\/[^\s"'`<>()\]},;|]+/gi,
    confidence: 'high',
    normalize: (v) => v.replace(/[.,;:]+$/, ''),
    reject: (value) => {
      try {
        return BENIGN_HOSTS.has(new URL(value).hostname.toLowerCase());
      } catch {
        return false;
      }
    },
  },
  {
    kind: 'ipv4',
    // Dotted quad with each octet bounded, so version numbers do not match.
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g,
    confidence: 'high',
    reject: (value) => {
      const octets = value.split('.').map(Number);
      // 0.x and 255.255.255.255 are not destinations; so is a lone 1.2.3.4
      // style version string, but bounding cannot tell those apart.
      return octets[0] === 0 || octets.every((o) => o === 255);
    },
  },
  {
    kind: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    confidence: 'high',
  },
  {
    kind: 'domain',
    // Bare hostnames are noisy, so only well-known suspicious or explicit
    // multi-label names with a real TLD count, and only at medium confidence.
    pattern: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|ru|cn|top|xyz|info|biz|online|site|club|tk|ml|ga|cf|pw|cc|io|co|us|uk|de|fr|nl|pl|br|in|ir|su)\b/gi,
    confidence: 'medium',
    normalize: (v) => v.toLowerCase(),
    reject: (value, context) => {
      if (BENIGN_HOSTS.has(value.toLowerCase())) return true;
      // Already captured as part of a URL.
      return new RegExp(`https?://[^\\s]*${escapeRegExp(value)}`, 'i').test(context);
    },
  },
  {
    kind: 'filepath',
    pattern:
      /(?:[A-Za-z]:\\|\\\\[A-Za-z0-9._-]+\\|%[A-Za-z]+%\\|\$env:[A-Za-z]+\\)[^\s"'`<>|*?]{2,200}/g,
    confidence: 'high',
    normalize: (v) => v.replace(/[.,;:)\]}]+$/, ''),
  },
  {
    kind: 'filepath',
    // A bare filename with an executable-ish extension is still worth showing.
    pattern: /\b[\w.-]{1,80}\.(?:exe|dll|ps1|bat|cmd|vbs|js|hta|scr)\b/gi,
    confidence: 'medium',
    normalize: (v) => v.toLowerCase(),
    reject: (value) => !PATH_EXTENSIONS.test(value),
  },
  {
    kind: 'registry',
    pattern:
      /\b(?:HKLM|HKCU|HKCR|HKU|HKCC|HKEY_[A-Z_]+)(?::\\|\\)[^\s"'`<>|*?]{2,200}/gi,
    confidence: 'high',
    normalize: (v) => v.replace(/[.,;:)\]}]+$/, ''),
  },
  {
    kind: 'scheduled-task',
    pattern: /\bschtasks(?:\.exe)?\b[^\n"']{0,200}/gi,
    confidence: 'high',
  },
  {
    kind: 'hash',
    pattern: /\b[a-f0-9]{32}\b|\b[a-f0-9]{40}\b|\b[a-f0-9]{64}\b/gi,
    confidence: 'medium',
    normalize: (v) => v.toLowerCase(),
  },
  {
    kind: 'base64-blob',
    // Long enough to be a payload rather than an encoded word.
    pattern: /\b[A-Za-z0-9+/]{120,}={0,2}/g,
    confidence: 'medium',
  },
];

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The base64 prefix an MZ/PE header produces, whatever the byte alignment. */
const PE_BASE64_PREFIXES = ['TVqQ', 'TVpQ', 'TVoA', 'TVro', 'TVpB'];

function findPe(layer: Layer): Ioc | undefined {
  for (const prefix of PE_BASE64_PREFIXES) {
    const index = layer.source.indexOf(prefix);
    if (index === -1) continue;
    // Confirm it is inside a real blob rather than three stray characters.
    const blob = /[A-Za-z0-9+/]{60,}={0,2}/.exec(layer.source.slice(index));
    if (!blob) continue;

    return {
      kind: 'pe',
      value: blob[0].slice(0, 64),
      defanged: blob[0].slice(0, 64),
      layer: layer.index,
      offset: index,
      context: contextAround(layer.source, index),
      confidence: 'high',
      occurrences: 1,
    };
  }
  return undefined;
}

function contextAround(source: string, offset: number, span = 60): string {
  const from = Math.max(0, offset - span);
  const to = Math.min(source.length, offset + span);
  return source.slice(from, to).replace(/\s+/g, ' ').trim();
}

/**
 * Harvest indicators from every layer of a trace.
 *
 * Deduplication keeps the *earliest* layer an indicator appeared in, since
 * that is where an analyst should look, and counts total occurrences.
 */
export function extractIocs(trace: Trace): IocReport {
  const found = new Map<string, Ioc>();

  const add = (ioc: Ioc): void => {
    const key = `${ioc.kind}\u0000${ioc.value.toLowerCase()}`;
    const existing = found.get(key);
    if (!existing) {
      found.set(key, ioc);
      return;
    }
    found.set(key, {
      ...existing,
      occurrences: existing.occurrences + ioc.occurrences,
      // Keep whichever sighting was earliest.
      ...(ioc.layer < existing.layer
        ? { layer: ioc.layer, offset: ioc.offset, context: ioc.context }
        : {}),
    });
  };

  let hasEmbeddedPe = false;

  for (const layer of trace.layers) {
    const pe = findPe(layer);
    if (pe) {
      hasEmbeddedPe = true;
      add(pe);
    }

    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      for (const match of layer.source.matchAll(rule.pattern)) {
        const raw = match[0];
        const value = rule.normalize ? rule.normalize(raw) : raw;
        if (value.length === 0) continue;

        const context = contextAround(layer.source, match.index ?? 0);
        if (rule.reject?.(value, layer.source)) continue;

        add({
          kind: rule.kind,
          value,
          defanged: defang(value),
          layer: layer.index,
          offset: match.index ?? 0,
          context,
          confidence: rule.confidence,
          occurrences: 1,
        });
      }
    }
  }

  // Events carry indicators the text does not: a URL passed to a stubbed
  // DownloadString is an argument, not something matched out of source.
  for (const event of trace.events) {
    for (const arg of event.args) {
      for (const rule of RULES) {
        if (rule.kind !== 'url' && rule.kind !== 'ipv4' && rule.kind !== 'filepath') continue;
        rule.pattern.lastIndex = 0;
        for (const match of arg.matchAll(rule.pattern)) {
          const value = rule.normalize ? rule.normalize(match[0]) : match[0];
          if (rule.reject?.(value, arg)) continue;
          add({
            kind: rule.kind,
            value,
            defanged: defang(value),
            layer: event.provenance.layer,
            offset: event.provenance.offset ?? 0,
            context: `${event.signature}(${arg})`,
            confidence: 'high',
            occurrences: 1,
          });
        }
      }
    }
  }

  const indicators = [...found.values()].sort(compareIocs);
  const byKind = new Map<IocKind, Ioc[]>();
  for (const ioc of indicators) {
    const bucket = byKind.get(ioc.kind);
    if (bucket) bucket.push(ioc);
    else byKind.set(ioc.kind, [ioc]);
  }

  return { indicators, byKind, hasEmbeddedPe };
}

/** High confidence first, then earliest layer, then value for stability. */
function compareIocs(a: Ioc, b: Ioc): number {
  if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
  if (a.layer !== b.layer) return a.layer - b.layer;
  return a.value.localeCompare(b.value);
}
