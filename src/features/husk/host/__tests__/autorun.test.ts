// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import { describe, expect, it } from 'vitest';

import { classifyAutorun } from '../autorun';

describe('autorun classification', () => {
  it('promotes a Run-key write, as the virtual registry spells it', () => {
    // The provider records positionally: (path, name, value).
    expect(
      classifyAutorun('registry.write', [
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        'Updater',
        'powershell -enc QQBB',
      ]),
    ).toBe('persistence.run-key');
  });

  it('promotes a Run-key write, as the cmdlet hook spells it', () => {
    // The hook renders bound parameters as name=value, and the hive is
    // abbreviated because that is what the sample wrote.
    expect(
      classifyAutorun('registry.write', [
        'Path=HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        'Name=Updater',
        'Value=C:\\evil.exe',
      ]),
    ).toBe('persistence.run-key');
  });

  it('leaves a subkey of the Run key alone', () => {
    // Windows honours values under Run and ignores subkeys of it, so this
    // establishes nothing. Drop the end anchor on the Run pattern and it is
    // reported as persistence — the category is only worth having if it is
    // trustworthy.
    expect(
      classifyAutorun('registry.write', [
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Foo',
        '(default)',
        'cmd',
      ]),
    ).toBe('registry.write');
  });

  it('leaves RunMRU alone', () => {
    // A recent-commands list under Explorer, not a persistence location: what
    // keeps it out is that the patterns require Run to sit directly under
    // CurrentVersion, not the end anchor above.
    expect(
      classifyAutorun('registry.write', [
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU',
        'a',
        'cmd',
      ]),
    ).toBe('registry.write');
  });

  it('leaves a read of the Run key alone', () => {
    expect(
      classifyAutorun('registry.read', [
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      ]),
    ).toBe('registry.read');
    expect(
      classifyAutorun('registry.enumerate', [
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      ]),
    ).toBe('registry.enumerate');
  });

  it('calls a write under the services key service persistence', () => {
    expect(
      classifyAutorun('registry.write', [
        'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\Updater',
        'ImagePath',
        'C:\\evil.exe',
      ]),
    ).toBe('persistence.service');
  });

  it('promotes Winlogon and Image File Execution Options', () => {
    expect(
      classifyAutorun('registry.write', [
        'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon',
        'Shell',
        'explorer.exe,evil.exe',
      ]),
    ).toBe('persistence.run-key');
    expect(
      classifyAutorun('registry.write', [
        'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\sethc.exe',
        'Debugger',
        'cmd.exe',
      ]),
    ).toBe('persistence.run-key');
  });

  it('promotes a copy into the Startup folder by its destination', () => {
    expect(
      classifyAutorun('filesystem.copy', [
        'Path=C:/temp/evil.exe',
        'Destination=C:/Users/a/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/evil.exe',
      ]),
    ).toBe('persistence.startup-folder');
  });

  it('does not promote a copy *out of* the Startup folder', () => {
    // Copy-Item's -Path is the source. Scanning every argument would call
    // collecting the folder's contents persistence, which is backwards.
    expect(
      classifyAutorun('filesystem.copy', [
        'Path=C:/Users/a/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/note.txt',
        'Destination=C:/temp/loot.txt',
      ]),
    ).toBe('filesystem.copy');
  });

  it('promotes a write whose -Path is the destination', () => {
    // Set-Content's -Path *is* where the bytes land, unlike Copy-Item's.
    expect(
      classifyAutorun('filesystem.write', [
        'Path=C:/ProgramData/Microsoft/Windows/Start Menu/Programs/Startup/run.vbs',
        'Value=WScript.Quit',
      ]),
    ).toBe('persistence.startup-folder');
  });

  it('promotes a positional destination from a proxy record', () => {
    // Net.WebClient.DownloadFile records the file it wrote and nothing else,
    // so there is no parameter name to check against.
    expect(
      classifyAutorun('filesystem.write', [
        'C:/Users/a/Start Menu/Programs/Startup/evil.exe',
      ]),
    ).toBe('persistence.startup-folder');
  });

  it('leaves a listing of the Startup folder alone', () => {
    expect(
      classifyAutorun('filesystem.list', [
        'Path=C:/Users/a/Start Menu/Programs/Startup',
      ]),
    ).toBe('filesystem.list');
  });

  it('does not mistake part of a path for a parameter name', () => {
    // A positional record is one bare path, and a path may contain '='. Taking
    // everything before the first '=' as a parameter name turns this into
    // name='C:/Users/a=b' — which is in no destination list, so the write is
    // skipped and the detection is lost.
    expect(
      classifyAutorun('filesystem.write', [
        'C:/Users/a=b/Start Menu/Programs/Startup/evil.exe',
      ]),
    ).toBe('persistence.startup-folder');
  });

  it('does not promote a Run-key path stored as a value', () => {
    // The recorded arguments of a registry write are the key, the value name
    // and the value. A loader that keeps the Run-key path around to read back
    // later establishes nothing by storing it, so only the argument that names
    // the key is considered.
    expect(
      classifyAutorun('registry.write', [
        'HKEY_CURRENT_USER\\Software\\Evil',
        'target',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      ]),
    ).toBe('registry.write');
  });

  it('leaves an unrelated write alone', () => {
    expect(
      classifyAutorun('registry.write', ['HKCU:\\Software\\Evil', 'x', '1']),
    ).toBe('registry.write');
    expect(
      classifyAutorun('filesystem.write', ['Path=C:/temp/a.txt']),
    ).toBe('filesystem.write');
  });
});
