import { describe, expect, it } from 'vitest';

import { CLEAN, isTainted, taintFrom } from '../taint';
import {
  psArray,
  psBool,
  psHashtable,
  psNumber,
  psObject,
  psString,
  toArrayValue,
  toBoolValue,
  toStringValue,
  typeNameOf,
  withTaint,
} from '../value';

describe('taint propagates through containers', () => {
  // The whole point of the model: a tainted value cannot be hidden inside a
  // structure and re-emerge looking trustworthy.
  it('taints an array containing a tainted element', () => {
    const arr = psArray([psString('ok'), psString('bad', taintFrom('g0'))]);
    expect(isTainted(arr.taint)).toBe(true);
    expect([...arr.taint]).toEqual(['g0']);
  });

  it('leaves an array of clean elements clean', () => {
    expect(psArray([psString('a'), psNumber(1)]).taint).toBe(CLEAN);
  });

  it('taints a hashtable containing a tainted value', () => {
    const table = psHashtable(new Map([['k', psString('bad', taintFrom('g0'))]]));
    expect([...table.taint]).toEqual(['g0']);
  });

  it('taints an object containing a tainted member', () => {
    const obj = psObject('Net.WebClient', new Map([['m', psNumber(1, taintFrom('g0'))]]));
    expect([...obj.taint]).toEqual(['g0']);
  });

  it('merges taint from several elements', () => {
    const arr = psArray([
      psString('a', taintFrom('g0')),
      psString('b', taintFrom('g1')),
    ]);
    expect([...arr.taint].sort()).toEqual(['g0', 'g1']);
  });
});

describe('withTaint', () => {
  it('adds taint without disturbing the value', () => {
    const tagged = withTaint(psString('x'), taintFrom('g0'));
    expect(tagged.value).toBe('x');
    expect([...tagged.taint]).toEqual(['g0']);
  });

  it('returns the same object when nothing is added', () => {
    const original = psString('x');
    expect(withTaint(original, CLEAN)).toBe(original);
  });
});

describe('string conversion', () => {
  it('renders booleans the way PowerShell does', () => {
    expect(toStringValue(psBool(true))).toBe('True');
    expect(toStringValue(psBool(false))).toBe('False');
  });

  // Obfuscators split a payload into an array and rely on this to rejoin it.
  it('joins arrays with a space', () => {
    expect(toStringValue(psArray([psString('a'), psString('b')]))).toBe('a b');
  });

  it('renders null as empty', () => {
    expect(toStringValue({ kind: 'null', taint: CLEAN })).toBe('');
  });
});

describe('truthiness follows PowerShell, not JavaScript', () => {
  it('treats the strings "0" and "false" as true', () => {
    expect(toBoolValue(psString('0'))).toBe(true);
    expect(toBoolValue(psString('false'))).toBe(true);
  });

  it('treats only the empty string as false', () => {
    expect(toBoolValue(psString(''))).toBe(false);
  });

  it('treats 0 as false', () => {
    expect(toBoolValue(psNumber(0))).toBe(false);
    expect(toBoolValue(psNumber(1))).toBe(true);
  });

  it('unwraps a single-element array to that element', () => {
    expect(toBoolValue(psArray([psNumber(0)]))).toBe(false);
    expect(toBoolValue(psArray([psNumber(1)]))).toBe(true);
  });

  it('treats an empty array as false and a multi-element one as true', () => {
    expect(toBoolValue(psArray([]))).toBe(false);
    expect(toBoolValue(psArray([psNumber(0), psNumber(0)]))).toBe(true);
  });
});

describe('enumeration', () => {
  it('returns array items unchanged', () => {
    const items = [psNumber(1), psNumber(2)];
    expect(toArrayValue(psArray(items))).toEqual(items);
  });

  it('treats null as empty and a scalar as a single element', () => {
    expect(toArrayValue({ kind: 'null', taint: CLEAN })).toEqual([]);
    expect(toArrayValue(psString('x'))).toHaveLength(1);
  });
});

describe('type names', () => {
  it('distinguishes integers from doubles', () => {
    expect(typeNameOf(psNumber(3))).toBe('System.Int32');
    expect(typeNameOf(psNumber(3.5))).toBe('System.Double');
  });

  it('reports the declared type for stub objects', () => {
    expect(typeNameOf(psObject('System.Net.WebClient'))).toBe('System.Net.WebClient');
  });
});
