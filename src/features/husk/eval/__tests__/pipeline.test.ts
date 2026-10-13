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

describe('operators found in real samples but not in the synthetic corpus', () => {
  // Invoke-Obfuscation never emits these, so the generated corpus could not
  // have caught them, and it did not: coverage over it is unchanged. They
  // turned up running the local corpus over sandbox-sourced samples, where
  // DotDot appeared 14 times and Ine 11 times in 300 files.
  //
  // Every case is wrapped in IEX on purpose. Only an evaluated position is
  // folded, so `$a = ('abc' -ine 'ABC')` asserts nothing at all - the first
  // version of these tests passed that way, with the operator never reached.
  it('folds an ascending range', async () => {
    const { output } = await deobfuscate(`IEX ((1..3) -join '-')`);
    expect(output).toBe('1-2-3');
  });

  it('folds a descending range, which is how a string gets reversed', async () => {
    const { output } = await deobfuscate(`IEX ((10..8) -join ',')`);
    expect(output).toBe('10,9,8');
  });

  it('refuses a range large enough to be a hang', async () => {
    // The bounds come from the sample, so an unbounded range is an allocation
    // no budget can interrupt: it happens inside a single expression.
    const { trace, reliable } = await deobfuscate(`IEX (1..99999999)`);
    expect(trace.gaps.ranked().some((g) => g.signature === 'operator DotDot')).toBe(true);
    expect(reliable).toBe(false);
  });

  it('compares case-insensitively with -ine', async () => {
    // 'abc' and 'ABC' are equal ignoring case, so -ine is False. Getting this
    // inverted would quietly flip every branch a sample takes.
    const { output, trace } = await deobfuscate(`IEX ('abc' -ine 'ABC')`);
    expect(output).toBe('False');
    expect(trace.gaps.size).toBe(0);
  });

  it('orders numerically when the left operand is a number, by string otherwise', async () => {
    expect((await deobfuscate(`IEX (65 -gt 9)`)).output).toBe('True');
    expect((await deobfuscate(`IEX ('b' -gt 'a')`)).output).toBe('True');
  });

  it('takes the collection on the left for -contains and on the right for -in', async () => {
    // Backwards, both of these still evaluate - to the wrong answer.
    expect((await deobfuscate(`IEX (@('a','b') -contains 'A')`)).output).toBe('True');
    expect((await deobfuscate(`IEX ('a' -in @('A','b'))`)).output).toBe('True');
  });

  it('leaves -match unimplemented, and says so', async () => {
    // Deliberate: it would compile a pattern out of sample-supplied text, and
    // a deobfuscator its input can make backtrack has handed over a hang.
    const { trace } = await deobfuscate(`IEX ('abc' -match 'a.*c')`);
    expect(trace.gaps.ranked().some((g) => g.signature === 'operator Imatch')).toBe(true);
  });

  // The bitwise forms were implemented and the logical ones were not, so
  // `-band` folded while `-and` was a gap. Every expected value here was
  // taken from pwsh 7.6.6 rather than from the documentation.
  it('folds -and, -or and -xor', async () => {
    expect((await deobfuscate(`IEX (1 -and 0)`)).output).toBe('False');
    expect((await deobfuscate(`IEX (1 -or 0)`)).output).toBe('True');
    expect((await deobfuscate(`IEX (1 -xor 1)`)).output).toBe('False');
    expect((await deobfuscate(`IEX (1 -xor 0)`)).output).toBe('True');
  });

  it('uses PowerShell truthiness, not JavaScript, for the logical operators', async () => {
    // '0' is a non-empty string, so it is true - the single case most likely
    // to be got wrong, and it flips whichever branch the sample takes.
    expect((await deobfuscate(`IEX ('0' -and 1)`)).output).toBe('True');
    expect((await deobfuscate(`IEX ('' -or 0)`)).output).toBe('False');
    // A one-element array takes that element's truthiness.
    expect((await deobfuscate(`IEX (@(0) -or 0)`)).output).toBe('False');
    expect((await deobfuscate(`IEX (@(1,2) -and 1)`)).output).toBe('True');
  });
});

describe('constant folding does not invent a value', () => {
  // The folder refuses a group whose evaluation hit a gap, because folding it
  // would be a guess. That check compared `trace.gaps.size` before and after,
  // and the ledger deduplicates by signature - so it only moved for a gap the
  // run had not seen before. A repeat was invisible: the group folded to
  // whatever the unresolved operand coerced to, and the result shipped as a
  // CLEAN layer, which could carry the whole run back to `reliable`.
  it('refuses a group whose gap signature was already in the ledger', async () => {
    const seeded = await deobfuscate(`$a = (1 -match 'x')
$b = ('p' + (2 -match 'y'))`);
    // The fabricated layer read `$b = 'p'`, dropping the -match that decides $b.
    expect(seeded.trace.layers).toHaveLength(1);
    expect(seeded.reliable).toBe(false);
  });

  it('behaves the same whether or not the gap was seen before', async () => {
    // The bug made the outcome depend on unrelated earlier text, which is the
    // part that makes it hard to spot in a real sample.
    const first = await deobfuscate(`$b = ('p' + (2 -match 'y'))`);
    const again = await deobfuscate(`$a = (1 -match 'x')
$b = ('p' + (2 -match 'y'))`);
    expect(again.trace.layers).toHaveLength(first.trace.layers.length);
    expect(again.reliable).toBe(first.reliable);
  });

  it('still folds a group that resolves completely', async () => {
    // The guard must not cost the folding this exists to do.
    const { output } = await deobfuscate(`IEX ('a' + ('b' + 'c'))`);
    expect(output).toBe('abc');
  });
});

describe('reliability is not vacuous', () => {
  // isReliable reads layer and event taint, so it answers "is what I produced
  // trustworthy". With nothing produced that is vacuously true, and two real
  // samples reported as fully resolved while the ledger held an unimplemented
  // construct - the worst failure the design exists to prevent.
  it('is false when a gap was recorded and nothing was produced', async () => {
    const { trace, reliable } = await deobfuscate(`IEX ('abc' -match 'a.*c')`);
    expect(trace.layers.length).toBe(1);
    expect(trace.events.length).toBe(0);
    expect(trace.gaps.size).toBeGreaterThan(0);
    expect(reliable).toBe(false);
  });

  it('stays true for an ordinary script with nothing to unwrap', async () => {
    // The other half: calling a benign script unreliable would cry wolf on
    // every one of them.
    const { trace, reliable } = await deobfuscate(`Write-Output 'hello'`);
    expect(trace.gaps.size).toBe(0);
    expect(reliable).toBe(true);
  });
});
