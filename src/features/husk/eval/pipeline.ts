// Husk - PowerShell deobfuscation and IOC extraction, fully browser-local.
// Copyright (c) 2026 Mo (@Mo4n6) - https://github.com/Mo4n6/tools
//
// The deobfuscation pipeline.
//
// Husk's equivalent of Didier Stevens' eval log: each time a script decodes
// something and hands it back to the interpreter, that becomes a layer, and
// the analyst reads the layers rather than the original.
//
// Two engines run per layer:
//   - Recipes, which pattern-match whole-command launcher shapes at the text
//     level (-EncodedCommand, compressed, character-array encoders).
//   - Expression folding, which evaluates an invocation's argument through the
//     constant folder. This is what unwraps token and string obfuscation.
//
// Anything neither engine handles is recorded as a gap, never guessed at.

import { Trace } from '../core/trace';
import { CLEAN, type Taint, markOutput, taintFrom } from '../core/taint';
import { toStringValue } from '../core/value';
import { TokenKind } from '../lexer/tokenKind';
import { tokenize } from '../lexer/tokenizer';
import { parseExpression } from './parser';
import { createContext, evaluate } from './evaluator';
import { base64ToBytes, decodeUtf16le, decodeUtf8, decompressAny, looksLikeText } from './decode';
import { canonicalize } from './canonicalize';
import { decodeCharArray } from './charArray';
import { splitPipeline, splitStatements } from './statements';
import type { Expr } from './ast';

export interface DeobfuscateOptions {
  /** How many layers to unwrap before giving up. */
  readonly maxLayers?: number;
  /** Wall-clock budget in milliseconds. */
  readonly timeBudgetMs?: number;
}

const DEFAULTS = { maxLayers: 24, timeBudgetMs: 5000 } as const;

export interface DeobfuscateResult {
  readonly trace: Trace;
  /** The deepest layer reached - the closest thing to a final stage. */
  readonly output: string;
  /** True when no layer depends on something Husk could not compute. */
  readonly reliable: boolean;
}

/** One decoding step: source text in, recovered text out. */
interface Recipe {
  readonly name: string;
  readonly apply: (source: string) => Promise<string | undefined>;
}

// --- Recipes --------------------------------------------------------------

/**
 * A bare base64 blob, with no launcher around it.
 *
 * Analysts paste these constantly - lifted out of a macro, a scheduled task
 * action, or an EDR command-line field, with the `-enc` already stripped. Real
 * Emotet droppers ship exactly this way. Without this recipe the input matches
 * nothing, and a pipeline that unwraps nothing and records nothing reports a
 * false clean, which is worse than any decoding error.
 */
const bareBase64: Recipe = {
  name: 'bare-base64',
  apply: async (source) => {
    const trimmed = source.trim().replace(/^\uFEFF/, '');
    // Long enough to be a payload, and essentially all base64.
    if (trimmed.length < 64) return undefined;
    if (!/^[A-Za-z0-9+/\s]+={0,2}$/.test(trimmed)) return undefined;

    const bytes = base64ToBytes(trimmed);
    if (bytes.length === 0) return undefined;

    // PowerShell command lines are UTF-16LE; macros sometimes use UTF-8. Try
    // the more likely one first and keep whichever yields script text.
    for (const decode of [decodeUtf16le, decodeUtf8]) {
      const text = decode(bytes);
      if (looksLikeText(text) && text.trim().length > 0) return text;
    }
    return undefined;
  },
};

/** powershell -EncodedCommand <base64>, in all its abbreviations. */
const encodedCommand: Recipe = {
  name: 'encodedcommand',
  apply: async (source) => {
    // -e, -en, -enc ... -encodedcommand are all accepted by powershell.exe.
    const match = /-e(?:n(?:c(?:o(?:d(?:e(?:d(?:c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?)?)?)?)?)?)?)?\s+['"]?([A-Za-z0-9+/=\s]{16,})['"]?/i.exec(
      source,
    );
    if (!match) return undefined;

    const bytes = base64ToBytes(match[1]);
    if (bytes.length === 0) return undefined;

    const text = decodeUtf16le(bytes);
    return looksLikeText(text) ? text : undefined;
  },
};

/**
 * DeflateStream or GzipStream over FromBase64String. Recognised by shape
 * rather than evaluated, because the surrounding New-Object pipeline needs the
 * phase 2 evaluator.
 */
const compressed: Recipe = {
  name: 'compressed',
  apply: async (source) => {
    if (!/(deflate|gzip)stream/i.test(source)) return undefined;

    const match = /frombase64string\s*\(\s*['"]([A-Za-z0-9+/=\s]+)['"]/i.exec(source);
    if (!match) return undefined;

    const inflated = await decompressAny(base64ToBytes(match[1]));
    if (!inflated) return undefined;

    const text = decodeUtf8(inflated);
    return looksLikeText(text) ? text : undefined;
  },
};

/**
 * Something that runs what it is given. Decoded bytes only become the next
 * *layer* when they reach one of these: otherwise the bytes are data the
 * script merely assigned, hashed or planted as a decoy, and replacing the
 * layer with them would discard the script that actually runs.
 */
const EXECUTION_SINK =
  /\b(?:iex|invoke-expression)\b|\|\s*[&.]?\s*['"]?\s*i?ex\b|\.\s*Invoke\s*\(|\bInvoke-Command\b|\[scriptblock\]|\bNewScriptBlock\b/i;

/** A bare base64 blob decoded to UTF-8, e.g. [Convert]::FromBase64String. */
const base64Utf8: Recipe = {
  name: 'base64',
  apply: async (source) => {
    if (/frombase64string/i.test(source) === false) return undefined;
    if (/(deflate|gzip)stream/i.test(source)) return undefined; // handled above

    // Without a sink the decoded bytes are data, not the next stage. The IOC
    // extractor still reports the blob; only layer promotion is withheld.
    if (!EXECUTION_SINK.test(source)) return undefined;

    const match = /frombase64string\s*\(\s*['"]([A-Za-z0-9+/=\s]+)['"]/i.exec(source);
    if (!match) return undefined;

    const bytes = base64ToBytes(match[1]);
    if (bytes.length === 0) return undefined;

    // Which encoding is named next decides how to read the bytes.
    const utf16 = /unicode\s*(?:\.|::)?\s*getstring/i.test(source);
    const text = utf16 ? decodeUtf16le(bytes) : decodeUtf8(bytes);
    return looksLikeText(text) ? text : undefined;
  },
};

/** Ascii, Hex, Octal, Binary and BXOR character-array launchers. */
const charArray: Recipe = {
  name: 'char-array',
  apply: async (source) => decodeCharArray(source),
};

const RECIPES: readonly Recipe[] = [
  encodedCommand,
  bareBase64,
  compressed,
  base64Utf8,
  charArray,
];

// --- Expression folding ---------------------------------------------------

/** Finds the invocation whose argument is the next layer, if there is one. */
function findInvocation(node: Expr): Expr | undefined {
  if (node.kind === 'invoke') return node;

  switch (node.kind) {
    case 'binary': {
      return findInvocation(node.left) ?? findInvocation(node.right);
    }
    case 'unary':
      return findInvocation(node.operand);
    case 'index':
      return findInvocation(node.target) ?? findInvocation(node.index);
    case 'member':
      return findInvocation(node.target) ?? node.args?.map(findInvocation).find(Boolean);
    case 'static':
      return node.args?.map(findInvocation).find(Boolean);
    case 'cast':
      return findInvocation(node.operand);
    case 'array':
      return node.items.map(findInvocation).find(Boolean);
    default:
      return undefined;
  }
}

/**
 * Evaluate an invocation's argument to the script it would run.
 *
 * `&('Wri'+'te-Host') 'x'` invokes a *computed command name*, which is a
 * different thing from `IEX $payload` invoking a computed script. Only the
 * latter is a new layer; the former is just a call, so a result that is short
 * and has no script shape is rejected.
 */
/** Names that mean Invoke-Expression, however they are spelled or computed. */
const IEX_NAMES = /^(iex|invoke-expression)$/i;

/**
 * `<payload> | IEX` sends its payload into the invocation through the
 * pipeline rather than as an argument. This is one of the most common shapes
 * in real samples, and reading only arguments misses it completely.
 */
function foldPipedInvocation(
  source: string,
  trace: Trace,
  layer: number,
): { text: string; taint: Taint } | undefined {
  const segments = splitPipeline(source);
  if (segments.length < 2) return undefined;

  const last = segments[segments.length - 1];
  const ctx = createContext(trace, layer);

  // The tail may be `IEX`, `&'iex'`, `.('i'+'ex')` or a computed name.
  const tail = last.text.trim().replace(/^[&.]\s*/, '');
  let name = tail.replace(/^['"]|['"]$/g, '');
  if (!IEX_NAMES.test(name)) {
    const parsed = parseExpression(tail);
    if (parsed.expression.kind === 'unsupported') return undefined;
    name = toStringValue(evaluate(parsed.expression, ctx)).trim();
  }
  if (!IEX_NAMES.test(name)) return undefined;

  const payloadSource = source.slice(0, last.start).replace(/\|\s*$/, '');
  const parsedPayload = parseExpression(payloadSource);
  const value = evaluate(parsedPayload.expression, ctx);
  const text = toStringValue(value);

  if (text.trim().length === 0 || text === source) return undefined;
  return { text, taint: value.taint };
}

/**
 * Fold the first statement that contains an invocation, splicing the result
 * back into the surrounding script. Samples are rarely a single expression.
 */
function foldInvocation(
  source: string,
  trace: Trace,
  layer: number,
): { text: string; taint: Taint; rewritten?: boolean } | undefined {
  const statements = splitStatements(source);
  if (statements.length > 1) {
    for (const statement of statements) {
      const folded = foldStatementInvocation(statement.text, trace, layer);
      if (!folded) continue;

      // A statement that yields a new script is the layer; one that only
      // rewrites its own text is spliced back into the surrounding source.
      if (!folded.rewritten) return folded;
      return {
        text: source.slice(0, statement.start) + folded.text + source.slice(statement.end),
        taint: folded.taint,
        rewritten: true,
      };
    }
    return undefined;
  }
  return foldStatementInvocation(source, trace, layer);
}

function foldStatementInvocation(
  source: string,
  trace: Trace,
  layer: number,
): { text: string; taint: Taint; rewritten?: boolean } | undefined {
  const parsed = parseExpression(source);
  const invocation = findInvocation(parsed.expression);
  if (!invocation || invocation.kind !== 'invoke') return undefined;

  const ctx = createContext(trace, layer);
  const callee = toStringValue(evaluate(invocation.callee, ctx)).trim();

  // Only a callee that names Invoke-Expression makes the argument a new
  // layer. Anything else is a computed *command name*: folding it in place
  // keeps the call's arguments, which taking the argument as a layer would
  // throw away.
  if (!/^(iex|invoke-expression)$/i.test(callee)) {
    if (callee.length === 0 || invocation.callee.kind === 'literal') return undefined;

    // Drop the invocation wrapper with the callee: `&('Wri'+'te-Host') "x"`
    // is simply `Write-Host "x"`, and that is what an analyst wants to read.
    // Only a name that can stand as a command is inlined; anything else keeps
    // its wrapper so the result stays valid PowerShell.
    const inlinable = /^[A-Za-z_][\w.\\/-]*$/.test(callee);
    const from = inlinable ? invocation.start : invocation.callee.start;
    const rewritten = source.slice(0, from) + callee + source.slice(invocation.callee.end);
    return rewritten === source ? undefined : { text: rewritten, taint: CLEAN, rewritten: true };
  }

  const value = evaluate(invocation.argument, ctx);
  const text = toStringValue(value);
  if (text.trim().length === 0) return undefined;
  return { text, taint: value.taint };
}

/**
 * Fold every constant expression in the source, rewriting each to its value.
 * This is what turns ('Wri'+'te-'+'Host') into Write-Host without needing the
 * surrounding statement to be understood.
 */
function foldConstants(source: string, trace: Trace, layer: number): string | undefined {
  const tokens = tokenize(source).tokens;
  if (tokens.length === 0) return undefined;

  const ctx = createContext(trace, layer);
  const pieces: string[] = [];
  let cursor = 0;
  let changed = false;

  // Walk parenthesised groups; each one that folds to a literal is replaced.
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.text !== '(') continue;

    // A '(' *touching* a name or ']' is an argument list or a cast target;
    // replacing it with a literal would delete syntax the script needs.
    // `Write-Host ('a'+'b')` has a space, so it is a command argument group
    // and does fold - the whitespace is the whole distinction.
    const previous = tokens[i - 1];
    if (
      previous &&
      previous.end === token.start &&
      (previous.kind === TokenKind.Identifier ||
        previous.kind === TokenKind.Generic ||
        previous.kind === TokenKind.RBracket ||
        // Obfuscators write the member name as a string:
        // [Convert]::"toBase64String"(...). The parens are still an argument
        // list, so folding them away would delete syntax.
        previous.kind === TokenKind.StringLiteral ||
        previous.kind === TokenKind.StringExpandable)
    ) {
      continue;
    }

    const close = matchParen(tokens, i);
    if (close === -1) continue;

    const inner = source.slice(token.end, tokens[close].start);
    if (!/['"]|\bchar\b|\bf\b/i.test(inner)) continue;

    const parsed = parseExpression(inner);
    if (parsed.expression.kind === 'unsupported') continue;

    const before = trace.gaps.size;
    const value = evaluate(parsed.expression, ctx);
    if (trace.gaps.size !== before) continue; // folding it would be a guess
    if (value.kind !== 'string' && value.kind !== 'number') continue;

    const text = toStringValue(value);
    pieces.push(source.slice(cursor, token.start), quote(text));
    cursor = tokens[close].end;
    i = close;
    changed = true;
  }

  if (!changed) return undefined;
  pieces.push(source.slice(cursor));
  return pieces.join('');
}

function matchParen(tokens: readonly { text: string }[], open: number): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i += 1) {
    if (tokens[i].text === '(') depth += 1;
    else if (tokens[i].text === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const quote = (text: string): string => `'${text.replace(/'/g, "''")}'`;

// --- Driver ---------------------------------------------------------------

/**
 * Unwrap a sample layer by layer.
 *
 * Budgets are enforced rather than advisory: an anti-analysis sample must not
 * be able to hang the worker.
 */
export async function deobfuscate(
  source: string,
  options: DeobfuscateOptions = {},
): Promise<DeobfuscateResult> {
  const maxLayers = options.maxLayers ?? DEFAULTS.maxLayers;
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULTS.timeBudgetMs;
  const deadline = Date.now() + timeBudgetMs;

  const trace = new Trace(source);
  const seen = new Set<string>([source]);
  let current = source;
  // True when the loop ended because it ran out of iterations rather than
  // because unwrapping finished. That output is still obfuscated and must not
  // be reported as a resolved final stage.
  let exhaustedLayers = true;

  for (let depth = 0; depth < maxLayers; depth += 1) {
    if (Date.now() > deadline) {
      const id = trace.gaps.report({
        kind: 'GAP',
        signature: 'time budget exhausted',
        argTypes: [],
        provenance: { layer: depth },
        detail: `stopped after ${timeBudgetMs}ms`,
      });
      trace.taintDeepest(taintFrom(id));
      exhaustedLayers = false;
      break;
    }

    const next = await unwrapOnce(current, trace, depth);
    if (!next) {
      exhaustedLayers = false;
      // Stopping is only honest if it says so. If the residue still carries
      // obfuscation Husk recognises but could not resolve, that is a gap, not
      // a finished unwrap.
      recordResidue(current, trace, depth);
      break;
    }

    // A layer that repeats one already seen is a loop, not progress.
    if (seen.has(next.text)) {
      exhaustedLayers = false;
      break;
    }
    seen.add(next.text);

    trace.addLayer(next.text, next.origin, next.taint);
    current = next.text;
  }

  // A sample that produced no layers, no events and no gaps has either
  // nothing to unwrap - a perfectly ordinary script - or something Husk did
  // not understand. Those must not be conflated: calling the first unreliable
  // would cry wolf on every benign script, and calling the second clean is
  // the worst failure available.
  //
  // The tokenizer separates them. Source it read without complaint is a
  // script with no obfuscation; source that produced diagnostics or Unknown
  // tokens is something it could not read.
  if (trace.layers.length === 1 && trace.gaps.size === 0 && !isReadableScript(source)) {
    const id = trace.gaps.report({
      kind: 'GAP',
      signature: 'no rule matched this input',
      argTypes: [],
      provenance: { layer: 0 },
      detail:
        'nothing was decoded and no construct was recognised; the input may not be PowerShell, or may use an encoding Husk does not implement',
    });
    trace.taintDeepest(taintFrom(id));
  }

  if (exhaustedLayers) {
    const id = trace.gaps.report({
      kind: 'GAP',
      signature: 'layer budget exhausted',
      argTypes: [],
      provenance: { layer: trace.deepest.index },
      detail: `stopped after ${maxLayers} layers while still making progress`,
    });
    trace.taintDeepest(taintFrom(id));
  }

  markOutput(trace.gaps, trace.deepest.taint);

  return {
    trace,
    output: trace.deepest.source,
    reliable: trace.isReliable,
  };
}

/**
 * Obfuscation Husk can recognise but has no rule for yet. Each entry is a
 * signature the gap report can rank, so the residue names what to build next
 * rather than just saying "stuck".
 */
const RESIDUE_MARKERS: ReadonlyArray<[RegExp, string]> = [
  [/\bfrombase64string\b/i, '[Convert]::FromBase64String in unresolved position'],
  [/\b(?:iex|invoke-expression)\b/i, 'Invoke-Expression with an unresolved argument'],
  [/\bnew-object\b/i, 'New-Object'],
  [/\bsecurestring\b/i, 'SecureString payload'],
  [/\bmarshal\b/i, '[Runtime.InteropServices.Marshal]'],
  [/\b(?:foreach-object|%\s*\{)/i, 'ForEach-Object pipeline'],
  [/-bxor\b/i, '-bxor loop'],
  [/\[\s*char\s*[\]\[]/i, '[char] conversion in unresolved position'],
  [/"\{\d+\}/, 'format operator with an unresolved operand'],
  [/-join\b/i, '-join with an unresolved operand'],
  [/\bset-item\b|\bget-item\b|\bset-variable\b|\bget-variable\b/i, 'variable indirection'],
  // The special-character-only encoder builds numbers from ++ and +$() with
  // punctuation-named variables, so it needs statement-level evaluation.
  [/\$\{[#!$^&*]+\}/, 'special-character-only encoding'],
  [/\+\s*\$\(\s*\)/, 'arithmetic built from +$()'],
];

function recordResidue(source: string, trace: Trace, layer: number): void {
  for (const [pattern, signature] of RESIDUE_MARKERS) {
    if (!pattern.test(source)) continue;
    const id = trace.gaps.report({
      kind: 'GAP',
      signature,
      argTypes: [],
      provenance: { layer },
      detail: 'recognised but not resolvable without the phase 2 evaluator',
    });
    // The deepest layer depends on this, so it must stop reading as reliable.
    trace.taintDeepest(taintFrom(id));
    return;
  }
}

/**
 * True when the tokenizer read this source cleanly, meaning any lack of
 * findings is a genuinely unremarkable script rather than a failure to parse.
 */
function isReadableScript(source: string): boolean {
  if (source.trim().length === 0) return true;

  const { tokens, diagnostics } = tokenize(source);
  if (diagnostics.length > 0) return false;
  return !tokens.some((t) => t.kind === TokenKind.Unknown);
}

interface Unwrapped {
  readonly text: string;
  readonly origin: Parameters<Trace['addLayer']>[1];
  readonly taint: Taint;
}

async function unwrapOnce(
  source: string,
  trace: Trace,
  layer: number,
): Promise<Unwrapped | undefined> {
  for (const recipe of RECIPES) {
    const decoded = await recipe.apply(source);
    if (decoded && decoded !== source) {
      return {
        text: decoded,
        origin: { via: 'decode', transform: recipe.name, from: layer },
        taint: CLEAN,
      };
    }
  }

  // Lossless spelling fixes first: they make everything downstream simpler.
  const canonical = canonicalize(source);
  if (canonical && canonical !== source) {
    return {
      text: canonical,
      origin: { via: 'decode', transform: 'canonicalize', from: layer },
      taint: CLEAN,
    };
  }

  for (const statement of splitStatements(source)) {
    const piped = foldPipedInvocation(statement.text, trace, layer);
    if (piped && piped.text !== source) {
      return {
        text: piped.text,
        origin: { via: 'invoke', operator: '| IEX', from: layer },
        taint: piped.taint,
      };
    }
  }

  const folded = foldInvocation(source, trace, layer);
  if (folded && folded.text !== source) {
    return {
      text: folded.text,
      origin: folded.rewritten
        ? { via: 'decode', transform: 'computed-command-name', from: layer }
        : { via: 'invoke', operator: 'IEX', from: layer },
      taint: folded.taint,
    };
  }

  const constants = foldConstants(source, trace, layer);
  if (constants && constants !== source) {
    return {
      text: constants,
      origin: { via: 'decode', transform: 'constant-folding', from: layer },
      taint: CLEAN,
    };
  }

  return undefined;
}
