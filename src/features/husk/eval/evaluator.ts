// Constant folding over the expression AST.
//
// Every value carries taint, and anything Husk cannot compute records a gap
// and keeps going rather than returning a plausible wrong answer. See
// docs/husk-spec.md sections 3 and 4.

import type { GapKind, Provenance } from '../core/gaps';
import { type Taint, propagate, taintFrom } from '../core/taint';
import {
  type PSValue,
  psArray,
  psBool,
  psNull,
  psNumber,
  psString,
  toArrayValue,
  toBoolValue,
  toStringValue,
  typeNameOf,
  withTaint,
} from '../core/value';
import type { Trace } from '../core/trace';
import { TokenKind } from '../lexer/tokenKind';
import type { Expr } from './ast';
import { HOST_CONSTANTS, HOST_SPECIFIC, LITERAL_VARIABLES } from './hostConstants';

export interface EvalContext {
  readonly trace: Trace;
  /** Which decoded layer this expression came from. */
  readonly layer: number;
  /** Variables assigned earlier in the same layer. */
  readonly variables: Map<string, PSValue>;
}

export function createContext(trace: Trace, layer = 0): EvalContext {
  return { trace, layer, variables: new Map() };
}

function gap(
  ctx: EvalContext,
  kind: GapKind,
  signature: string,
  argTypes: readonly string[],
  node: { start: number },
  detail?: string,
): Taint {
  const provenance: Provenance = { layer: ctx.layer, offset: node.start };
  const id = ctx.trace.gaps.report({
    kind,
    signature,
    argTypes: [...argTypes],
    provenance,
    ...(detail ? { detail } : {}),
  });
  return taintFrom(id);
}

/** Evaluate an expression to a value. Never throws. */
export function evaluate(node: Expr, ctx: EvalContext): PSValue {
  switch (node.kind) {
    case 'literal':
      if (node.value === null) return psNull();
      if (typeof node.value === 'boolean') return psBool(node.value);
      if (typeof node.value === 'number') return psNumber(node.value);
      return psString(node.value);

    case 'array':
      return psArray(node.items.map((item) => evaluate(item, ctx)));

    case 'variable':
      return evaluateVariable(node.name, node, ctx);

    case 'unary':
      return evaluateUnary(node, ctx);

    case 'binary':
      return evaluateBinary(node, ctx);

    case 'index':
      return evaluateIndex(node, ctx);

    case 'cast':
      return evaluateCast(node.typeName, evaluate(node.operand, ctx), node, ctx);

    case 'member':
      return evaluateMember(node, ctx);

    case 'static':
      return evaluateStatic(node, ctx);

    case 'invoke':
      // Invocation is a layer boundary, handled by the pipeline. Evaluating
      // one here yields its argument so the pipeline can read the payload.
      return evaluate(node.argument, ctx);

    case 'unsupported':
      return psString(
        '',
        gap(ctx, 'GAP', node.reason, [], node, node.text.slice(0, 120)),
      );
  }
}

function evaluateVariable(name: string, node: Expr, ctx: EvalContext): PSValue {
  const assigned = ctx.variables.get(name);
  if (assigned) return assigned;

  const literal = LITERAL_VARIABLES.get(name);
  if (literal !== undefined) {
    return literal === null ? psNull() : psBool(literal);
  }

  const constant = HOST_CONSTANTS.get(name);
  if (constant !== undefined) return psString(constant);

  if (HOST_SPECIFIC.has(name)) {
    // Host-specific: synthesising a value here could silently produce a wrong
    // answer if it feeds key derivation, so record it instead.
    return psString(
      '',
      gap(ctx, 'HARD_BLOCK', `$${name}`, [], node, 'host-specific environment value'),
    );
  }

  return psNull(gap(ctx, 'GAP', `$${name}`, [], node, 'unassigned variable'));
}

function evaluateUnary(
  node: Extract<Expr, { kind: 'unary' }>,
  ctx: EvalContext,
): PSValue {
  const operand = evaluate(node.operand, ctx);
  const taint = propagate(ctx.trace.gaps, operand.taint);

  switch (node.op) {
    case TokenKind.Minus: {
      const n = toNumber(operand);
      return psNumber(n === undefined ? Number.NaN : -n, taint);
    }
    case TokenKind.Not:
      return psBool(!truthy(operand), taint);
    case TokenKind.Bnot: {
      const n = toNumber(operand);
      return psNumber(n === undefined ? Number.NaN : ~n, taint);
    }
    default:
      return psNull(gap(ctx, 'GAP', `unary ${TokenKind[node.op]}`, [], node));
  }
}

function evaluateBinary(
  node: Extract<Expr, { kind: 'binary' }>,
  ctx: EvalContext,
): PSValue {
  const left = evaluate(node.left, ctx);
  const right = evaluate(node.right, ctx);
  const taint = propagate(ctx.trace.gaps, left.taint, right.taint);

  switch (node.op) {
    case TokenKind.Plus:
      return evaluatePlus(left, right, taint);

    case TokenKind.Minus: {
      const a = toNumber(left);
      const b = toNumber(right);
      return psNumber(a === undefined || b === undefined ? Number.NaN : a - b, taint);
    }

    case TokenKind.Multiply:
      // PowerShell repeats strings and arrays: 'ab' * 3.
      if (left.kind === 'string') {
        const times = toNumber(right) ?? 0;
        return psString(left.value.repeat(Math.max(0, Math.trunc(times))), taint);
      }
      return psNumber((toNumber(left) ?? Number.NaN) * (toNumber(right) ?? Number.NaN), taint);

    case TokenKind.Divide:
      return psNumber((toNumber(left) ?? Number.NaN) / (toNumber(right) ?? Number.NaN), taint);

    case TokenKind.Rem:
      return psNumber((toNumber(left) ?? Number.NaN) % (toNumber(right) ?? Number.NaN), taint);

    case TokenKind.Format:
      return psString(formatOperator(toStringValue(left), toArrayValue(right)), taint);

    case TokenKind.Join: {
      const separator = toStringValue(right);
      return psString(toArrayValue(left).map(toStringValue).join(separator), taint);
    }

    case TokenKind.Isplit:
    case TokenKind.Csplit:
      return splitOperator(left, right, node.op === TokenKind.Csplit, taint);

    case TokenKind.Ireplace:
    case TokenKind.Creplace:
      return replaceOperator(left, right, node.op === TokenKind.Creplace, taint);

    case TokenKind.Bxor:
      return psNumber((toNumber(left) ?? 0) ^ (toNumber(right) ?? 0), taint);
    case TokenKind.Band:
      return psNumber((toNumber(left) ?? 0) & (toNumber(right) ?? 0), taint);
    case TokenKind.Bor:
      return psNumber((toNumber(left) ?? 0) | (toNumber(right) ?? 0), taint);
    case TokenKind.Shl:
      return psNumber((toNumber(left) ?? 0) << (toNumber(right) ?? 0), taint);
    case TokenKind.Shr:
      return psNumber((toNumber(left) ?? 0) >> (toNumber(right) ?? 0), taint);

    // The bitwise forms above were implemented and the logical ones were not,
    // so `$a -band $b` folded and `$a -and $b` was a gap. PowerShell
    // short-circuits these and this does not: both operands are already
    // evaluated by the time we get here, so a gap in the dead branch still
    // taints the result. That is the conservative direction - an analyst sees
    // "not fully resolved" rather than a confident answer resting on a branch
    // we never checked - and this evaluator folds expressions rather than
    // running them, so there are no skipped side effects to get wrong.
    case TokenKind.And:
      return psBool(toBoolValue(left) && toBoolValue(right), taint);
    case TokenKind.Or:
      return psBool(toBoolValue(left) || toBoolValue(right), taint);
    case TokenKind.Xor:
      return psBool(toBoolValue(left) !== toBoolValue(right), taint);

    case TokenKind.Ieq:
      return psBool(toStringValue(left).toLowerCase() === toStringValue(right).toLowerCase(), taint);
    case TokenKind.Ceq:
      return psBool(toStringValue(left) === toStringValue(right), taint);
    case TokenKind.Ine:
      return psBool(toStringValue(left).toLowerCase() !== toStringValue(right).toLowerCase(), taint);
    case TokenKind.Cne:
      return psBool(toStringValue(left) !== toStringValue(right), taint);

    // Ordering. PowerShell compares numerically when the left operand is a
    // number and by string otherwise, which is the rule that decides whether
    // '10' -gt '9' is true: as numbers yes, as strings no.
    case TokenKind.Igt:
    case TokenKind.Cgt:
      return psBool(compareOperands(left, right, node.op === TokenKind.Cgt) > 0, taint);
    case TokenKind.Ige:
    case TokenKind.Cge:
      return psBool(compareOperands(left, right, node.op === TokenKind.Cge) >= 0, taint);
    case TokenKind.Ilt:
    case TokenKind.Clt:
      return psBool(compareOperands(left, right, node.op === TokenKind.Clt) < 0, taint);
    case TokenKind.Ile:
    case TokenKind.Cle:
      return psBool(compareOperands(left, right, node.op === TokenKind.Cle) <= 0, taint);

    // Membership. -contains takes the collection on the left, -in on the
    // right; getting that backwards silently inverts the result.
    case TokenKind.Icontains:
    case TokenKind.Ccontains:
      return psBool(
        containsValue(left, right, node.op === TokenKind.Ccontains),
        taint,
      );
    case TokenKind.Iin:
    case TokenKind.Cin:
      return psBool(containsValue(right, left, node.op === TokenKind.Cin), taint);

    // The range operator, which obfuscators use to build char arrays and to
    // reverse strings - `[char[]](72,105)` and `$s[-1..-$s.Length]`.
    case TokenKind.DotDot:
      return rangeOperator(left, right, taint, ctx, node);

    // -like and -match stay unimplemented on purpose, and record a gap rather
    // than a wrong answer. Both would compile a pattern out of sample-supplied
    // text, and a deobfuscator that can be made to backtrack catastrophically
    // by its input has handed the sample a hang. The parser already caps
    // nesting for the same reason. Implementing them needs a bounded matcher,
    // not a RegExp.
    default:
      return psNull(gap(ctx, 'GAP', `operator ${TokenKind[node.op]}`, [], node));
  }
}

/**
 * PowerShell's comparison rule: numeric when the left operand is a number,
 * string otherwise. Returns the sign of left - right.
 */
function compareOperands(left: PSValue, right: PSValue, caseSensitive: boolean): number {
  const leftNumber = toNumber(left);
  if (leftNumber !== undefined) {
    const rightNumber = toNumber(right) ?? 0;
    return leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0;
  }

  const a = caseSensitive ? toStringValue(left) : toStringValue(left).toLowerCase();
  const b = caseSensitive ? toStringValue(right) : toStringValue(right).toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whether `collection` holds `item`, compared the way PowerShell compares. */
function containsValue(collection: PSValue, item: PSValue, caseSensitive: boolean): boolean {
  const needle = caseSensitive ? toStringValue(item) : toStringValue(item).toLowerCase();
  return toArrayValue(collection).some((entry) => {
    const hay = caseSensitive ? toStringValue(entry) : toStringValue(entry).toLowerCase();
    return hay === needle;
  });
}

/**
 * `1..10`, and the descending form obfuscators use to reverse a string.
 *
 * Bounded, because the operands come from the sample: `1..99999999` would
 * otherwise allocate until the tab died, which is the hang the budgets exist
 * to prevent and which no budget check inside a single expression would catch.
 * Over the cap it records a gap instead, so the result says it was refused.
 */
const MAX_RANGE = 65_536;

function rangeOperator(
  left: PSValue,
  right: PSValue,
  taint: Taint,
  ctx: EvalContext,
  node: { start: number },
): PSValue {
  const from = toNumber(left);
  const to = toNumber(right);
  if (from === undefined || to === undefined) {
    return psNull(
      gap(ctx, 'GAP', 'operator DotDot', [], node, 'a range bound did not resolve to a number'),
    );
  }

  const span = Math.abs(Math.trunc(to) - Math.trunc(from)) + 1;
  if (span > MAX_RANGE) {
    return psNull(
      gap(ctx, 'GAP', 'operator DotDot', [], node, `range of ${span} exceeds the ${MAX_RANGE} cap`),
    );
  }

  const start = Math.trunc(from);
  const step = Math.trunc(to) >= start ? 1 : -1;
  const values: PSValue[] = [];
  for (let i = 0; i < span; i += 1) values.push(psNumber(start + i * step, taint));
  return psArray(values, taint);
}

/** '+' concatenates strings and arrays, and adds numbers. */
function evaluatePlus(left: PSValue, right: PSValue, taint: Taint): PSValue {
  if (left.kind === 'array') {
    return psArray([...left.items, ...toArrayValue(right)], taint);
  }
  if (left.kind === 'string') {
    return psString(left.value + toStringValue(right), taint);
  }
  const a = toNumber(left);
  const b = toNumber(right);
  if (a !== undefined && b !== undefined) return psNumber(a + b, taint);
  return psString(toStringValue(left) + toStringValue(right), taint);
}

/** PowerShell's -f, which is .NET composite formatting. */
function formatOperator(format: string, args: readonly PSValue[]): string {
  return format.replace(/\{(\d+)(?::[^}]*)?\}/g, (whole, indexText: string) => {
    const index = Number.parseInt(indexText, 10);
    const arg = args[index];
    return arg === undefined ? whole : toStringValue(arg);
  });
}

function splitOperator(
  left: PSValue,
  right: PSValue,
  caseSensitive: boolean,
  taint: Taint,
): PSValue {
  const subject = toStringValue(left);
  const separators = toArrayValue(right).map(toStringValue);

  let parts: string[] = [subject];
  for (const separator of separators) {
    if (separator === '') continue;
    // PowerShell's -split takes a regular expression, so '\d' splits on any
    // digit rather than on the two literal characters. (The .Split() *method*
    // is literal, and lives in members.ts.) A pattern JavaScript cannot
    // compile falls back to a literal search rather than failing the run.
    let pattern: RegExp;
    try {
      pattern = new RegExp(separator, caseSensitive ? 'g' : 'gi');
    } catch {
      pattern = new RegExp(escapeRegExp(separator), caseSensitive ? 'g' : 'gi');
    }
    parts = parts.flatMap((part) => part.split(pattern));
  }
  return psArray(parts.map((p) => psString(p)), taint);
}

function replaceOperator(
  left: PSValue,
  right: PSValue,
  caseSensitive: boolean,
  taint: Taint,
): PSValue {
  const subject = toStringValue(left);
  const args = toArrayValue(right);
  const pattern = toStringValue(args[0] ?? psString(''));
  const replacement = args.length > 1 ? toStringValue(args[1]) : '';

  // -replace takes a regular expression, not a literal.
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
  } catch {
    regex = new RegExp(escapeRegExp(pattern), caseSensitive ? 'g' : 'gi');
  }
  // .NET substitutions must be honoured: '(a)(b)' -replace '$2$1' is 'ba',
  // not the literal '$2$1'. JavaScript shares $1..$9, $&, $` and $', and
  // treats $$ as an escaped dollar the same way, so the replacement string
  // can be passed through. The one divergence is .NET's named-group syntax
  // ${name}, which JavaScript spells $<name>.
  const jsReplacement = replacement.replace(/\$\{(\w+)\}/g, '$<$1>');
  return psString(subject.replace(regex, jsReplacement), taint);
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function evaluateIndex(
  node: Extract<Expr, { kind: 'index' }>,
  ctx: EvalContext,
): PSValue {
  const target = evaluate(node.target, ctx);
  const index = evaluate(node.index, ctx);
  const taint = propagate(ctx.trace.gaps, target.taint, index.taint);

  // A list of indices selects several elements: $s[1,3] and $s[4,15,25].
  const indices = index.kind === 'array' ? index.items : [index];
  const picked: PSValue[] = [];

  for (const one of indices) {
    const i = toNumber(one);
    if (i === undefined) {
      picked.push(psString('', gap(ctx, 'GAP', 'non-numeric index', [typeNameOf(one)], node)));
      continue;
    }
    picked.push(elementAt(target, Math.trunc(i), taint));
  }

  if (picked.length === 1) return picked[0];
  return psArray(picked, taint);
}

/** Index a string or array, with PowerShell's negative-from-the-end rule. */
function elementAt(target: PSValue, index: number, taint: Taint): PSValue {
  if (target.kind === 'string') {
    const i = index < 0 ? target.value.length + index : index;
    const c = target.value[i];
    return c === undefined ? psNull(taint) : psString(c, taint);
  }
  if (target.kind === 'array') {
    const i = index < 0 ? target.items.length + index : index;
    const item = target.items[i];
    if (item === undefined) return psNull(taint);
    // The element carries its own taint, but the container's and the index's
    // matter too: splitting a host-derived string yields a tainted array of
    // clean pieces, and returning one raw would make it look trustworthy.
    return withTaint(item, taint);
  }
  const text = toStringValue(target);
  const i = index < 0 ? text.length + index : index;
  const c = text[i];
  return c === undefined ? psNull(taint) : psString(c, taint);
}

function truthy(value: PSValue): boolean {
  if (value.kind === 'bool') return value.value;
  if (value.kind === 'number') return value.value !== 0;
  if (value.kind === 'string') return value.value.length > 0;
  if (value.kind === 'null') return false;
  return true;
}

function toNumber(value: PSValue | undefined): number | undefined {
  // Members index their argument list directly, so a call written with fewer
  // arguments than the member expects arrives here as undefined. Real samples
  // do that; crashing on it loses the whole analysis.
  if (value === undefined) return undefined;
  if (value.kind === 'number') return value.value;
  if (value.kind === 'bool') return value.value ? 1 : 0;
  if (value.kind === 'null') return 0;
  if (value.kind === 'string') {
    const trimmed = value.value.trim();
    if (trimmed === '') return 0;
    const parsed = /^0[xX]/.test(trimmed)
      ? Number.parseInt(trimmed.slice(2), 16)
      : Number(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

// Member and static dispatch live in ./members.ts so that every call routes
// through a single chokepoint - spec commitment 3.
import { callMember, callStatic, evaluateCastValue } from './members';

function evaluateMember(
  node: Extract<Expr, { kind: 'member' }>,
  ctx: EvalContext,
): PSValue {
  const target = evaluate(node.target, ctx);
  const args = (node.args ?? []).map((a) => evaluate(a, ctx));
  return callMember(target, node.name, node.args ? args : undefined, node, ctx);
}

function evaluateStatic(
  node: Extract<Expr, { kind: 'static' }>,
  ctx: EvalContext,
): PSValue {
  const args = (node.args ?? []).map((a) => evaluate(a, ctx));
  return callStatic(node.typeName, node.name, node.args ? args : undefined, node, ctx);
}

function evaluateCast(
  typeName: string,
  operand: PSValue,
  node: Expr,
  ctx: EvalContext,
): PSValue {
  return evaluateCastValue(typeName, operand, node, ctx);
}

export { gap, toNumber, formatOperator };
