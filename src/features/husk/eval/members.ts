// The single dispatch chokepoint for member access, static calls and casts.
//
// Spec commitment 3: every property read, method call and cast routes through
// here. That is what makes instrumentation free and bypass impossible - a
// sample cannot reach .NET by some other spelling, because there is no other
// path.

import { type Taint, propagate } from '../core/taint';
import {
  type PSValue,
  psArray,
  psNull,
  psNumber,
  psObject,
  psString,
  toArrayValue,
  toStringValue,
  typeNameOf,
} from '../core/value';
import type { Expr } from './ast';
import { type EvalContext, gap, toNumber } from './evaluator';

const str = (value: PSValue): string => toStringValue(value);

/** Normalizes [System.Text.Encoding] and [Text.Encoding] to one key. */
function normalizeType(typeName: string): string {
  return typeName.replace(/^system\./i, '').replace(/[`\s]/g, '').toLowerCase();
}

// --- Instance members -----------------------------------------------------

type MemberImpl = (
  target: PSValue,
  args: readonly PSValue[],
  taint: Taint,
  ctx: EvalContext,
  node: Expr,
) => PSValue;

const STRING_MEMBERS: Readonly<Record<string, MemberImpl>> = {
  tostring: (t, _a, taint) => psString(str(t), taint),
  toupper: (t, _a, taint) => psString(str(t).toUpperCase(), taint),
  toupperinvariant: (t, _a, taint) => psString(str(t).toUpperCase(), taint),
  tolower: (t, _a, taint) => psString(str(t).toLowerCase(), taint),
  tolowerinvariant: (t, _a, taint) => psString(str(t).toLowerCase(), taint),
  trim: (t, a, taint) =>
    psString(a.length ? trimChars(str(t), str(a[0]), true, true) : str(t).trim(), taint),
  trimstart: (t, a, taint) =>
    psString(a.length ? trimChars(str(t), str(a[0]), true, false) : str(t).trimStart(), taint),
  trimend: (t, a, taint) =>
    psString(a.length ? trimChars(str(t), str(a[0]), false, true) : str(t).trimEnd(), taint),
  // .Replace is a literal replacement, unlike the -replace operator.
  replace: (t, a, taint) =>
    psString(a.length >= 2 ? str(t).split(str(a[0])).join(str(a[1])) : str(t), taint),
  substring: (t, a, taint) => {
    const start = toNumber(a[0]) ?? 0;
    const length = a.length > 1 ? toNumber(a[1]) : undefined;
    const text = str(t);
    return psString(
      length === undefined ? text.slice(start) : text.slice(start, start + length),
      taint,
    );
  },
  split: (t, a, taint) => {
    const separators = a.length ? toArrayValue(a[0]).map(str) : [' '];
    let parts = [str(t)];
    for (const separator of separators) {
      if (separator === '') continue;
      parts = parts.flatMap((p) => p.split(separator));
    }
    return psArray(parts.map((p) => psString(p)), taint);
  },
  insert: (t, a, taint) => {
    const at = toNumber(a[0]) ?? 0;
    const text = str(t);
    return psString(text.slice(0, at) + str(a[1] ?? psString('')) + text.slice(at), taint);
  },
  remove: (t, a, taint) => {
    const at = toNumber(a[0]) ?? 0;
    const count = a.length > 1 ? (toNumber(a[1]) ?? 0) : undefined;
    const text = str(t);
    return psString(
      count === undefined ? text.slice(0, at) : text.slice(0, at) + text.slice(at + count),
      taint,
    );
  },
  padleft: (t, a, taint) =>
    psString(str(t).padStart(toNumber(a[0]) ?? 0, a.length > 1 ? str(a[1]) : ' '), taint),
  padright: (t, a, taint) =>
    psString(str(t).padEnd(toNumber(a[0]) ?? 0, a.length > 1 ? str(a[1]) : ' '), taint),
  indexof: (t, a, taint) => psNumber(str(t).indexOf(str(a[0] ?? psString(''))), taint),
  lastindexof: (t, a, taint) => psNumber(str(t).lastIndexOf(str(a[0] ?? psString(''))), taint),
  contains: (t, a, taint) => psNumber(str(t).includes(str(a[0] ?? psString(''))) ? 1 : 0, taint),
  startswith: (t, a, taint) => psNumber(str(t).startsWith(str(a[0] ?? psString(''))) ? 1 : 0, taint),
  endswith: (t, a, taint) => psNumber(str(t).endsWith(str(a[0] ?? psString(''))) ? 1 : 0, taint),
  tochararray: (t, _a, taint) =>
    psArray([...str(t)].map((c) => psString(c)), taint),
};

function trimChars(text: string, chars: string, start: boolean, end: boolean): string {
  const set = new Set([...chars]);
  let from = 0;
  let to = text.length;
  if (start) while (from < to && set.has(text[from])) from += 1;
  if (end) while (to > from && set.has(text[to - 1])) to -= 1;
  return text.slice(from, to);
}

/** Members available on every value. */
const UNIVERSAL_MEMBERS: Readonly<Record<string, MemberImpl>> = {
  length: (t, _a, taint) =>
    psNumber(t.kind === 'array' ? t.items.length : str(t).length, taint),
  count: (t, _a, taint) =>
    psNumber(t.kind === 'array' ? t.items.length : str(t).length, taint),
  gettype: (t, _a, taint) => psString(typeNameOf(t), taint),
  // .Invoke() on a string re-enters the interpreter; the pipeline treats the
  // enclosing node as a layer boundary, so the value just passes through.
  invoke: (t, _a, taint) => ({ ...t, taint }),
};

const ARRAY_MEMBERS: Readonly<Record<string, MemberImpl>> = {
  foreach: (t, _a, taint, ctx, node) =>
    psArray(
      toArrayValue(t),
      propagate(
        ctx.trace.gaps,
        taint,
        gap(ctx, 'GAP', 'ForEach() with a script block', [], node, 'needs the phase 2 evaluator'),
      ),
    ),
};

export function callMember(
  target: PSValue,
  name: string,
  args: readonly PSValue[] | undefined,
  node: Expr,
  ctx: EvalContext,
): PSValue {
  const key = name.toLowerCase();
  const argList = args ?? [];
  const taint = propagate(ctx.trace.gaps, target.taint, ...argList.map((a) => a.taint));

  const universal = UNIVERSAL_MEMBERS[key];
  if (universal) return universal(target, argList, taint, ctx, node);

  if (target.kind === 'object' && target.typeName.startsWith('System.Text.Encoding.')) {
    const encoding = target.typeName.slice('System.Text.Encoding.'.length);
    if (key === 'getstring') {
      const bytes = Uint8Array.from(
        toArrayValue(argList[0] ?? psArray([])).map((v) => (toNumber(v) ?? 0) & 0xff),
      );
      // 'unicode' is .NET's name for UTF-16LE, not for "any Unicode".
      const label = encoding === 'unicode' ? 'utf-16le'
        : encoding === 'bigendianunicode' ? 'utf-16be'
        : encoding === 'ascii' ? 'windows-1252'
        : 'utf-8';
      return psString(new TextDecoder(label).decode(bytes), taint);
    }
    if (key === 'getbytes') {
      const text = str(argList[0] ?? psString(''));
      if (encoding === 'unicode') {
        const out: PSValue[] = [];
        for (const unit of text) {
          const code = unit.charCodeAt(0);
          out.push(psNumber(code & 0xff), psNumber((code >> 8) & 0xff));
        }
        return psArray(out, taint);
      }
      return psArray([...new TextEncoder().encode(text)].map((b) => psNumber(b)), taint);
    }
  }

  if (target.kind === 'array') {
    const arrayMember = ARRAY_MEMBERS[key];
    if (arrayMember) return arrayMember(target, argList, taint, ctx, node);
  }

  const stringMember = STRING_MEMBERS[key];
  if (stringMember) return stringMember(target, argList, taint, ctx, node);

  return psNull(
    propagate(
      ctx.trace.gaps,
      taint,
      gap(ctx, 'GAP', `${typeNameOf(target)}.${name}()`, argList.map(typeNameOf), node),
    ),
  );
}

// --- Static members -------------------------------------------------------

type StaticImpl = (
  args: readonly PSValue[],
  taint: Taint,
  ctx: EvalContext,
  node: Expr,
) => PSValue;

const CONVERT: Readonly<Record<string, StaticImpl>> = {
  frombase64string: (a, taint) => {
    const bytes = decodeBase64(str(a[0] ?? psString('')));
    return psArray([...bytes].map((b) => psNumber(b)), taint);
  },
  tobase64string: (a, taint) => {
    const bytes = toArrayValue(a[0] ?? psArray([])).map((v) => (toNumber(v) ?? 0) & 0xff);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return psString(btoa(binary), taint);
  },
  tobyte: (a, taint) => {
    const base = a.length > 1 ? (toNumber(a[1]) ?? 10) : 10;
    return psNumber(Number.parseInt(str(a[0] ?? psString('0')), base) & 0xff, taint);
  },
  toint32: (a, taint) => {
    const base = a.length > 1 ? (toNumber(a[1]) ?? 10) : 10;
    return psNumber(Number.parseInt(str(a[0] ?? psString('0')), base) | 0, taint);
  },
  tochar: (a, taint) => psString(String.fromCharCode(toNumber(a[0]) ?? 0), taint),
};

const ENCODING_MEMBERS: Readonly<Record<string, StaticImpl>> = {
  getstring: (a, taint) => {
    const bytes = Uint8Array.from(toArrayValue(a[0] ?? psArray([])).map((v) => (toNumber(v) ?? 0) & 0xff));
    return psString(new TextDecoder('utf-8').decode(bytes), taint);
  },
  getbytes: (a, taint) => {
    const bytes = new TextEncoder().encode(str(a[0] ?? psString('')));
    return psArray([...bytes].map((b) => psNumber(b)), taint);
  },
};

const STRING_STATICS: Readonly<Record<string, StaticImpl>> = {
  join: (a, taint) => {
    const separator = str(a[0] ?? psString(''));
    const items = a.slice(1).flatMap((v) => toArrayValue(v));
    return psString(items.map(str).join(separator), taint);
  },
  format: (a, taint) => {
    const format = str(a[0] ?? psString(''));
    const args = a.slice(1);
    return psString(
      format.replace(/\{(\d+)(?::[^}]*)?\}/g, (whole, i: string) => {
        const arg = args[Number.parseInt(i, 10)];
        return arg === undefined ? whole : str(arg);
      }),
      taint,
    );
  },
  concat: (a, taint) => psString(a.map(str).join(''), taint),
  isnullorempty: (a, taint) => psNumber(str(a[0] ?? psString('')).length === 0 ? 1 : 0, taint),
};

const CHAR_STATICS: Readonly<Record<string, StaticImpl>> = {
  toupper: (a, taint) => psString(str(a[0] ?? psString('')).toUpperCase(), taint),
  tolower: (a, taint) => psString(str(a[0] ?? psString('')).toLowerCase(), taint),
  converttoutf32: (a, taint) => psNumber(str(a[0] ?? psString('')).codePointAt(0) ?? 0, taint),
};

const MATH_STATICS: Readonly<Record<string, StaticImpl>> = {
  abs: (a, taint) => psNumber(Math.abs(toNumber(a[0]) ?? 0), taint),
  floor: (a, taint) => psNumber(Math.floor(toNumber(a[0]) ?? 0), taint),
  ceiling: (a, taint) => psNumber(Math.ceil(toNumber(a[0]) ?? 0), taint),
  round: (a, taint) => psNumber(Math.round(toNumber(a[0]) ?? 0), taint),
  max: (a, taint) => psNumber(Math.max(...a.map((v) => toNumber(v) ?? 0)), taint),
  min: (a, taint) => psNumber(Math.min(...a.map((v) => toNumber(v) ?? 0)), taint),
  pow: (a, taint) => psNumber((toNumber(a[0]) ?? 0) ** (toNumber(a[1]) ?? 0), taint),
};

/** Static tables keyed by normalized type name. */
const STATIC_TYPES: Readonly<Record<string, Readonly<Record<string, StaticImpl>>>> = {
  convert: CONVERT,
  string: STRING_STATICS,
  char: CHAR_STATICS,
  math: MATH_STATICS,
};

/**
 * Encoding statics live behind a property: [Text.Encoding]::UTF8.GetString().
 * The property read yields this marker object, whose members are the table
 * above.
 */
const ENCODING_TYPES = new Set(['text.encoding', 'encoding']);

export function callStatic(
  typeName: string,
  name: string,
  args: readonly PSValue[] | undefined,
  node: Expr,
  ctx: EvalContext,
): PSValue {
  const type = normalizeType(typeName);
  const key = name.toLowerCase();
  const argList = args ?? [];
  const taint = propagate(ctx.trace.gaps, ...argList.map((a) => a.taint));

  if (ENCODING_TYPES.has(type)) {
    const encodingMember = ENCODING_MEMBERS[key];
    if (encodingMember) return encodingMember(argList, taint, ctx, node);
    // [Text.Encoding]::UTF8 and friends are property reads that yield an
    // encoding; every encoding Husk models decodes the same way.
    if (['utf8', 'ascii', 'unicode', 'default', 'bigendianunicode', 'utf32'].includes(key)) {
      // A property read yielding an encoding, so that the .GetString() or
      // .GetBytes() that follows has something to dispatch on.
      return psObject(`System.Text.Encoding.${key}`, new Map(), taint);
    }
  }

  const table = STATIC_TYPES[type];
  const impl = table?.[key];
  if (impl) return impl(argList, taint, ctx, node);

  return psNull(
    propagate(
      ctx.trace.gaps,
      taint,
      gap(ctx, 'GAP', `[${typeName}]::${name}()`, argList.map(typeNameOf), node),
    ),
  );
}

// --- Casts ----------------------------------------------------------------

export function evaluateCastValue(
  typeName: string,
  operand: PSValue,
  node: Expr,
  ctx: EvalContext,
): PSValue {
  const type = normalizeType(typeName);
  const taint = propagate(ctx.trace.gaps, operand.taint);

  switch (type) {
    case 'char':
      return psString(String.fromCharCode(toNumber(operand) ?? 0), taint);

    case 'char[]':
      // [char[]]"abc" explodes a string; [char[]](65,66) maps code points.
      if (operand.kind === 'string') {
        return psArray([...operand.value].map((c) => psString(c)), taint);
      }
      return psArray(
        toArrayValue(operand).map((v) => psString(String.fromCharCode(toNumber(v) ?? 0))),
        taint,
      );

    case 'string':
      return psString(str(operand), taint);

    case 'string[]':
      return psArray(toArrayValue(operand).map((v) => psString(str(v))), taint);

    case 'int':
    case 'int32':
    case 'int64':
    case 'long':
      return psNumber(Math.trunc(toNumber(operand) ?? Number.NaN), taint);

    case 'byte':
      return psNumber((toNumber(operand) ?? 0) & 0xff, taint);

    case 'byte[]':
      return psArray(
        toArrayValue(operand).map((v) => psNumber((toNumber(v) ?? 0) & 0xff)),
        taint,
      );

    case 'double':
    case 'decimal':
    case 'single':
      return psNumber(toNumber(operand) ?? Number.NaN, taint);

    case 'bool':
    case 'boolean':
      return psNumber(toNumber(operand) ?? 0, taint);

    case 'regex':
    case 'type':
      // A type or regex literal used as a value is its own name.
      return psString(str(operand), taint);

    default:
      return psNull(
        propagate(ctx.trace.gaps, taint, gap(ctx, 'GAP', `[${typeName}] cast`, [typeNameOf(operand)], node)),
      );
  }
}

/** Base64 to bytes, tolerating the whitespace obfuscators insert. */
function decodeBase64(text: string): Uint8Array {
  const cleaned = text.replace(/\s+/g, '');
  try {
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return new Uint8Array();
  }
}

export { decodeBase64, normalizeType };
