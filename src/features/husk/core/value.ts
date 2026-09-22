// The PowerShell value model.
//
// Every value carries taint, so anything derived from something Husk could not
// compute stays marked all the way to the output. See ./taint.ts.
//
// This is deliberately not a faithful model of PowerShell's type system: it
// covers what obfuscated commodity droppers actually manipulate. Anything
// beyond that becomes a PSObject stub with a recorded gap rather than a
// silently wrong value.

import { CLEAN, type Taint, union, unionAll } from './taint';

export type PSValue =
  | PSNull
  | PSBool
  | PSNumber
  | PSString
  | PSArray
  | PSHashtable
  | PSScriptBlock
  | PSType
  | PSObject;

interface Tainted {
  readonly taint: Taint;
}

export interface PSNull extends Tainted {
  readonly kind: 'null';
}
export interface PSBool extends Tainted {
  readonly kind: 'bool';
  readonly value: boolean;
}
export interface PSNumber extends Tainted {
  readonly kind: 'number';
  readonly value: number;
}
export interface PSString extends Tainted {
  readonly kind: 'string';
  readonly value: string;
}
export interface PSArray extends Tainted {
  readonly kind: 'array';
  readonly items: readonly PSValue[];
}
export interface PSHashtable extends Tainted {
  readonly kind: 'hashtable';
  /** Keys are lowercased: PowerShell hashtable lookup is case-insensitive. */
  readonly entries: ReadonlyMap<string, PSValue>;
}
export interface PSScriptBlock extends Tainted {
  readonly kind: 'scriptblock';
  /** Source text, so an unevaluated block still shows up in the trace. */
  readonly source: string;
}
/** A type literal such as [System.Convert]. */
export interface PSType extends Tainted {
  readonly kind: 'type';
  readonly typeName: string;
}
/**
 * Anything Husk models only as a named shape: a stubbed WebClient, an
 * unimplemented .NET instance. Members resolve through the dispatch
 * chokepoint, not from here.
 */
export interface PSObject extends Tainted {
  readonly kind: 'object';
  readonly typeName: string;
  readonly members: ReadonlyMap<string, PSValue>;
}

/** Lazily yields each value's taint, so no spread is built. */
function* iterTaints(values: Iterable<PSValue>): Generator<Taint> {
  for (const value of values) yield value.taint;
}

// --- Constructors ---------------------------------------------------------

export const psNull = (taint: Taint = CLEAN): PSNull => ({ kind: 'null', taint });

export const psBool = (value: boolean, taint: Taint = CLEAN): PSBool => ({
  kind: 'bool',
  value,
  taint,
});

export const psNumber = (value: number, taint: Taint = CLEAN): PSNumber => ({
  kind: 'number',
  value,
  taint,
});

export const psString = (value: string, taint: Taint = CLEAN): PSString => ({
  kind: 'string',
  value,
  taint,
});

/** Array taint is the union of its own and every element's. */
export const psArray = (items: readonly PSValue[], taint: Taint = CLEAN): PSArray => ({
  kind: 'array',
  items,
  taint: unionAll([taint, ...iterTaints(items)]),
});

export const psHashtable = (
  entries: ReadonlyMap<string, PSValue>,
  taint: Taint = CLEAN,
): PSHashtable => ({
  kind: 'hashtable',
  entries,
  taint: unionAll([taint, ...iterTaints(entries.values())]),
});

export const psScriptBlock = (source: string, taint: Taint = CLEAN): PSScriptBlock => ({
  kind: 'scriptblock',
  source,
  taint,
});

export const psType = (typeName: string, taint: Taint = CLEAN): PSType => ({
  kind: 'type',
  typeName,
  taint,
});

export const psObject = (
  typeName: string,
  members: ReadonlyMap<string, PSValue> = new Map(),
  taint: Taint = CLEAN,
): PSObject => ({
  kind: 'object',
  typeName,
  members,
  taint: unionAll([taint, ...iterTaints(members.values())]),
});

/** Re-tag a value with additional taint, preserving everything else. */
export function withTaint<T extends PSValue>(value: T, extra: Taint): T {
  const combined = union(value.taint, extra);
  return combined === value.taint ? value : { ...value, taint: combined };
}

// --- Coercions ------------------------------------------------------------
//
// PowerShell's conversion rules are wide; these cover the cases obfuscated
// droppers hit. Anything outside them should raise a gap at the call site
// rather than be guessed at here.

/** PowerShell's type name for a value, for gap signatures and traces. */
export function typeNameOf(value: PSValue): string {
  switch (value.kind) {
    case 'null':
      return '$null';
    case 'bool':
      return 'System.Boolean';
    case 'number':
      return Number.isInteger(value.value) ? 'System.Int32' : 'System.Double';
    case 'string':
      return 'System.String';
    case 'array':
      return 'System.Object[]';
    case 'hashtable':
      return 'System.Collections.Hashtable';
    case 'scriptblock':
      return 'System.Management.Automation.ScriptBlock';
    case 'type':
      return `System.Type(${value.typeName})`;
    case 'object':
      return value.typeName;
  }
}

/**
 * String conversion. Arrays join with a space, matching PowerShell's default
 * output field separator - this is how `"$arr"` behaves, and obfuscators use
 * it to reassemble split payloads.
 */
export function toStringValue(value: PSValue): string {
  switch (value.kind) {
    case 'null':
      return '';
    case 'bool':
      return value.value ? 'True' : 'False';
    case 'number':
      return String(value.value);
    case 'string':
      return value.value;
    case 'array':
      return value.items.map(toStringValue).join(' ');
    case 'hashtable':
      return 'System.Collections.Hashtable';
    case 'scriptblock':
      return value.source;
    case 'type':
      return value.typeName;
    case 'object':
      return value.typeName;
  }
}

/** Truthiness, following PowerShell rather than JavaScript. */
export function toBoolValue(value: PSValue): boolean {
  switch (value.kind) {
    case 'null':
      return false;
    case 'bool':
      return value.value;
    case 'number':
      return value.value !== 0;
    case 'string':
      // Unlike JavaScript, "0" and "false" are both true: only empty is false.
      return value.value.length > 0;
    case 'array':
      // Empty is false; a single element takes that element's truthiness.
      if (value.items.length === 0) return false;
      if (value.items.length === 1) return toBoolValue(value.items[0]);
      return true;
    case 'hashtable':
    case 'scriptblock':
    case 'type':
    case 'object':
      return true;
  }
}

/** Flatten to an array, as PowerShell does when a value is enumerated. */
export function toArrayValue(value: PSValue): readonly PSValue[] {
  if (value.kind === 'array') return value.items;
  if (value.kind === 'null') return [];
  return [value];
}
