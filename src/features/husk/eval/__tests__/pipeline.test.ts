import { describe, expect, it } from 'vitest';

import { canonicalize } from '../canonicalize';
import { decodeCharArray } from '../charArray';
import { deobfuscate } from '../pipeline';
import { splitStatements } from '../statements';

const out = async (source: string): Promise<string> => (await deobfuscate(source)).output;

describe('canonicalization is lossless', () => {
  it('removes escape backticks from a command name', () => {
    expect(canonicalize('Wri`te-Ho`st "x"')).toBe('Write-Host "x"');
  });

  it('unbraces a plain variable name', () => {
    expect(canonicalize('${a} = 1')).toBe('$a = 1');
  });

  it('handles braces and backticks together', () => {
    expect(canonicalize('${T`AR`GEt} = 1')).toBe('$TARGEt = 1');
  });

  it('unquotes a member name written as a string', () => {
    expect(canonicalize('[Convert]::"ToBase64String"($b)')).toBe(
      '[Convert]::ToBase64String($b)',
    );
  });

  // $x.Method.Invoke(args) is the same call as $x.Method(args).
  it('drops a method-reference Invoke', () => {
    expect(canonicalize('[Text.Encoding]::UTF8.GetBytes.Invoke("x")')).toBe(
      '[Text.Encoding]::UTF8.GetBytes("x")',
    );
  });

  it('leaves an already-canonical script alone', () => {
    expect(canonicalize('Write-Host "x"')).toBeUndefined();
  });

  it('keeps braces where they are load-bearing', () => {
    expect(canonicalize('${weird name} = 1')).toBeUndefined();
  });
});

describe('statement splitting', () => {
  it('splits on semicolons and newlines', () => {
    expect(splitStatements('$a = 1; $b = 2\n$c = 3').map((s) => s.text.trim())).toEqual([
      '$a = 1',
      '$b = 2',
      '$c = 3',
    ]);
  });

  // A separator inside brackets belongs to an argument list or script block.
  it('ignores separators inside brackets', () => {
    expect(splitStatements('Foo(1; 2); Bar').map((s) => s.text.trim())).toEqual([
      'Foo(1; 2)',
      'Bar',
    ]);
  });

  it('ignores separators inside a script block', () => {
    expect(splitStatements('% { $a; $b }; Next').map((s) => s.text.trim())).toEqual([
      '% { $a; $b }',
      'Next',
    ]);
  });
});

describe('character-array decoding', () => {
  it('decodes a decimal list', () => {
    const source = "[char[]](72,101,108,108,111,32,104,117,115,107) -join ''";
    expect(decodeCharArray(source)).toBe('Hello husk');
  });

  it('decodes a hex list at the radix the script names', () => {
    const source =
      "('48','65','6c','6c','6f','20','68','75','73','6b') | %{ [char][convert]::ToInt16(([string]$_),16) }";
    expect(decodeCharArray(source)).toBe('Hello husk');
  });

  it('applies an XOR key', () => {
    const key = 0x3b;
    const encoded = [...'Hello husk'].map((c) => c.charCodeAt(0) ^ key).join(',');
    const source = `[char[]](${encoded}) | % { [char]($_ -bxor "0x3b") }`;
    expect(decodeCharArray(source)).toBe('Hello husk');
  });

  // PowerShell's -split operator is case-insensitive, so a chain declaring
  // 'A' also splits on 'a'. Treating it as case-sensitive silently truncates.
  it('treats -split delimiters as case-insensitive', () => {
    // Mixed case on purpose: only 'A' is declared as the delimiter.
    const source =
      "('72A101a108A108a111A32a104A117a115A107' -split 'A' | % { [char][int]$_ }) -join ''";
    expect(decodeCharArray(source)).toBe('Hello husk');
  });

  it('returns nothing when the shape does not match', () => {
    expect(decodeCharArray('Write-Host "x"')).toBeUndefined();
  });
});

describe('end to end', () => {
  it('unwraps -EncodedCommand', async () => {
    const payload = 'Write-Host "hello husk"';
    const utf16 = new Uint8Array(payload.length * 2);
    for (let i = 0; i < payload.length; i += 1) utf16[i * 2] = payload.charCodeAt(i);
    const b64 = btoa(String.fromCharCode(...utf16));
    expect(await out(`powershell -EncodedCommand ${b64}`)).toBe(payload);
  });

  it('folds a concatenated string argument', async () => {
    expect(await out("Write-Host ('hel'+'lo'+' husk')")).toBe("Write-Host 'hello husk'");
  });

  it('folds the format operator', async () => {
    expect(await out(`Write-Host ("{1}{0}" -f ' husk','hello')`)).toBe(
      "Write-Host 'hello husk'",
    );
  });

  // A computed callee is a command *name*, not a payload: inlining it must
  // keep the call's arguments.
  it('inlines a computed command name without losing arguments', async () => {
    expect(await out(`&('Wri'+'te-Host') "hello husk"`)).toBe('Write-Host "hello husk"');
  });

  it('resolves IEX spelled out of host constants', async () => {
    const result = await deobfuscate(`&($ShellId[1]+$ShellId[13]+'X')('Write-Host 1')`);
    expect(result.output).toContain('Write-Host 1');
  });

  it('stops on a self-referential loop rather than spinning', async () => {
    const result = await deobfuscate('IEX $x');
    expect(result.trace.layers.length).toBeLessThan(5);
  });

  it('honours the layer budget', async () => {
    const result = await deobfuscate("Write-Host ('a'+'b')", { maxLayers: 1 });
    expect(result.trace.layers.length).toBeLessThanOrEqual(2);
  });
});
