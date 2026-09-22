// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
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

/**
 * Cap on matches taken from one rule in one layer. A megabyte of hex yields
 * tens of thousands of shapes that pass a pattern; past a few hundred they
 * are noise, and collecting them all is what turns a large sample into a
 * multi-second analysis.
 */
const MAX_MATCHES_PER_RULE = 500;

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
    // '@' is legal in a URL (userinfo), but '@' followed by a scheme is a
    // separator: Emotet packs its fallback URLs as
    // http://a.test/x/@http://b.test/y/@... and matching greedily across
    // those swallows the whole chain as one indicator.
    // The length bound is load-bearing, not cosmetic: a negative lookahead
    // inside an unbounded quantifier recurses per character, and real samples
    // contain megabytes of unbroken base64 that the character class matches.
    // That overflowed the stack. 2048 is far beyond any real URL.
    pattern: /\b(?:https?|ftp):\/\/(?:(?!@(?:https?|ftp):\/\/)[^\s"'`<>()\]},;|]){1,2048}/gi,
    confidence: 'high',
    // A trailing '@' is a list separator, not a path character. Real samples
    // end their chain with one:
    //   http://a.test/nh@http://b.test/dobgx@...@http://e.test/u8erijeq@
    // A URL legitimately ending in '@' is possible but is not distinguishable
    // from that, and does not occur in any observed sample, so the separator
    // reading wins.
    normalize: (v) => v.replace(/[.,;:@]+$/, ''),
    reject: (value) => {
      try {
        const host = new URL(value).hostname.toLowerCase();
        if (BENIGN_HOSTS.has(host)) return true;
        if (isIpAddress(host)) return false;
        // A hostname with no dot is a fragment, not a destination - it appears
        // when a layer still has the URL split across a concatenation.
        return !host.includes('.');
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
    // Every quantifier is bounded, and that is the whole point. The
    // unbounded form
    //   /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
    // backtracks catastrophically: over a multi-megabyte unbroken run
    // containing no '@' - which is exactly what a hex-encoded payload is -
    // every start position consumes the rest of the file, fails to find an
    // '@', then retries one character along. That is quadratic, and it hung
    // a corpus run for an hour on a single 3MB sample.
    //
    // RFC 5321 bounds the local part at 64 characters and the domain at 255,
    // so nothing real is lost by bounding them here.
    pattern: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,24}\b/g,
    confidence: 'high',
  },
  {
    kind: 'domain',
    // Bare hostnames are noisy, so only well-known suspicious or explicit
    // multi-label names with a real TLD count, and only at medium confidence.
    // The label repetition is bounded for the same reason as the email rule:
    // a hostname has at most a handful of labels, and an unbounded '+' over a
    // long run is a backtracking hazard.
    pattern: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){1,8}(?:com|net|org|ru|cn|top|xyz|info|biz|online|site|club|tk|ml|ga|cf|pw|cc|io|co|us|uk|de|fr|nl|pl|br|in|ir|su)\b/gi,
    confidence: 'medium',
    normalize: (v) => v.toLowerCase(),
    reject: (value, context) => {
      if (BENIGN_HOSTS.has(value.toLowerCase())) return true;

      // A real hostname is at most 253 characters. Anything longer matched
      // something else - a hex-encoded PE reads as dotted labels, and real
      // samples do contain those.
      if (value.length > 253) return true;

      // Already captured as part of a URL. This is a plain substring search
      // on purpose: building a RegExp out of matched text crashed on real
      // input, and escaping is not a fix when the text is unbounded.
      const haystack = context.toLowerCase();
      const needle = value.toLowerCase();
      let from = 0;
      for (;;) {
        const at = haystack.indexOf(needle, from);
        if (at === -1) return false;
        const before = haystack.slice(Math.max(0, at - 12), at);
        if (/:\/\/[^\s]*$/.test(before)) return true;
        from = at + 1;
      }
    },
  },
  {
    kind: 'filepath',
    // The drive letter must not be the tail of a longer word, or 'HKCU:\\'
    // reads as a path on drive U:.
    pattern:
      /(?:(?<![A-Za-z])[A-Za-z]:\\|\\\\[A-Za-z0-9._-]+\\|%[A-Za-z]+%\\|\$env:[A-Za-z]+\\)[^\s"'`<>|*?]{2,200}/g,
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
    // Long enough to be a payload rather than an encoded word, and bounded
    // above because it must be: an open-ended {120,} over the multi-megabyte
    // unbroken base64 in real samples overflows V8's regex stack outright.
    pattern: /\b[A-Za-z0-9+/]{120,4096}={0,2}/g,
    confidence: 'medium',
    // Only the head is reported; the blob itself is in the layer view. This
    // also makes chunks of one blob collapse to a single indicator instead of
    // one per 4096 characters.
    normalize: (v) => v.slice(0, 96),
  },
];


/**
 * True for a literal IP host.
 *
 * Testing `[0-9a-f:]` alone is not enough: plenty of English words are pure
 * hexadecimal - bad, face, dead, beef, cafe, add - so a concatenation
 * fragment like `http://bad` would read as an address and slip past the
 * hostname-fragment filter.
 */
function isIpAddress(host: string): boolean {
  // IPv6 is bracketed by the URL parser and always contains a colon.
  if (host.startsWith('[') && host.endsWith(']')) return host.includes(':');
  if (host.includes(':')) return true;

  const octets = host.split('.');
  if (octets.length !== 4) return false;
  return octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

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
  const truncated = new Set<IocKind>();

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
      // A single rule must not be able to flood the report from one huge
      // layer. Distinct indicators past this point are noise, not signal.
      let matches = 0;
      for (const match of layer.source.matchAll(rule.pattern)) {
        if ((matches += 1) > MAX_MATCHES_PER_RULE) {
          // Truncation must be stated. A report silently cut at 500 looks
          // identical to a sample that genuinely had 500 indicators.
          truncated.add(rule.kind);
          break;
        }
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

  for (const kind of truncated) {
    trace.gaps.report({
      kind: 'GAP',
      signature: `${kind} indicators truncated`,
      argTypes: [],
      provenance: { layer: 0 },
      detail: `more than ${MAX_MATCHES_PER_RULE} matches in one layer; the list is incomplete`,
    });
  }

  const indicators = [...found.values()].sort(compareIocs);
  const byKind = new Map<IocKind, Ioc[]>();
  for (const ioc of indicators) {
    const bucket = byKind.get(ioc.kind);
    if (bucket) bucket.push(ioc);
    else byKind.set(ioc.kind, [ioc]);
  }

  return { indicators, byKind, hasEmbeddedPe, truncatedKinds: [...truncated] };
}

/** High confidence first, then earliest layer, then value for stability. */
function compareIocs(a: Ioc, b: Ioc): number {
  if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
  if (a.layer !== b.layer) return a.layer - b.layer;
  return a.value.localeCompare(b.value);
}
