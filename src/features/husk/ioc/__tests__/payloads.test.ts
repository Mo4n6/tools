import { describe, expect, it } from 'vitest';

import { extractPayloads } from '../payloads';
import { Trace } from '../../core/trace';
import { CLEAN } from '../../core/taint';

const traceOf = (source: string): Trace => new Trace(source);

describe('extractPayloads', () => {
  // The sample that prompted this: a dropper carrying its payload inline as a
  // PowerShell byte array, feeding VirtualAlloc. Nothing is fetched and nothing
  // is written to disk, so neither the indicator list nor the dropped-file
  // panel had anything to offer and the bytes were unreachable.
  const shellcode = Array.from({ length: 64 }, (_, i) => `0x${(i % 256).toString(16)}`).join(',');

  it('pulls a byte-array literal out as bytes', () => {
    const found = extractPayloads(traceOf(`[Byte[]]$z = ${shellcode};`));
    expect(found).toHaveLength(1);
    expect(found[0].bytes).toHaveLength(64);
    expect(found[0].bytes[5]).toBe(5);
  });

  it('ignores a short array, which is a constant and not a payload', () => {
    // @(1,2,3) and an RGB triple must not show up as payloads.
    expect(extractPayloads(traceOf('$rgb = 0xff,0x00,0x7f'))).toHaveLength(0);
  });

  it('names a PE header, because that is the one worth saying out loud', () => {
    const pe = ['0x4d', '0x5a', ...Array.from({ length: 40 }, () => '0x00')].join(',');
    expect(extractPayloads(traceOf(`$b = ${pe}`))[0].magic).toMatch(/PE \(MZ\)/);
  });

  it('says when there is no header at all, rather than guessing a type', () => {
    const sc = ['0xfc', '0xe8', ...Array.from({ length: 40 }, () => '0x90')].join(',');
    expect(extractPayloads(traceOf(`$b = ${sc}`))[0].magic).toMatch(/raw shellcode/);
  });

  it('reports the same blob in two layers twice, not once', () => {
    // Seeing it again after a decode says the decoder round-tripped it, which
    // is information; collapsing them would hide that.
    const trace = traceOf(`$a = ${shellcode}`);
    trace.addLayer(`$b = ${shellcode}`, { via: 'decode', transform: 'test', from: 0 }, CLEAN);
    expect(extractPayloads(trace)).toHaveLength(2);
  });
});
