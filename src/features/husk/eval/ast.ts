// Expression AST for Husk's constant folder.
//
// This is deliberately expression-only: phase 1 unwraps encoding layers, which
// are expressions. Statements, loops and functions arrive with the evaluator in
// phase 2. Anything outside the subset becomes an `unsupported` node carrying
// its source text, so it is recorded as a gap rather than silently dropped.

import type { TokenKind } from '../lexer/tokenKind';

export type Expr =
  | LiteralExpr
  | ArrayExpr
  | BinaryExpr
  | UnaryExpr
  | VariableExpr
  | IndexExpr
  | MemberExpr
  | StaticMemberExpr
  | CastExpr
  | InvokeExpr
  | UnsupportedExpr;

interface Spanned {
  readonly start: number;
  readonly end: number;
}

export interface LiteralExpr extends Spanned {
  readonly kind: 'literal';
  readonly value: string | number | boolean | null;
}

/** A comma-separated list, e.g. `'a','b','c'`. */
export interface ArrayExpr extends Spanned {
  readonly kind: 'array';
  readonly items: readonly Expr[];
}

export interface BinaryExpr extends Spanned {
  readonly kind: 'binary';
  readonly op: TokenKind;
  readonly left: Expr;
  readonly right: Expr;
}

export interface UnaryExpr extends Spanned {
  readonly kind: 'unary';
  readonly op: TokenKind;
  readonly operand: Expr;
}

export interface VariableExpr extends Spanned {
  readonly kind: 'variable';
  /** Without the leading '$', lowercased; e.g. 'env:comspec'. */
  readonly name: string;
}

export interface IndexExpr extends Spanned {
  readonly kind: 'index';
  readonly target: Expr;
  readonly index: Expr;
}

/** `.Name` or `.Name(args)`. `args` is undefined for a property read. */
export interface MemberExpr extends Spanned {
  readonly kind: 'member';
  readonly target: Expr;
  readonly name: string;
  readonly args?: readonly Expr[];
}

/** `[Type]::Name` or `[Type]::Name(args)`. */
export interface StaticMemberExpr extends Spanned {
  readonly kind: 'static';
  readonly typeName: string;
  readonly name: string;
  readonly args?: readonly Expr[];
}

/** `[Type]expr`, e.g. `[char]72` or `[string]$x`. */
export interface CastExpr extends Spanned {
  readonly kind: 'cast';
  readonly typeName: string;
  readonly operand: Expr;
}

/**
 * A call that re-enters the interpreter: `IEX $s`, `& $s`, `. $s`,
 * `$s.Invoke()`. These are the layer boundaries - Husk's equivalent of
 * Didier Stevens' eval log.
 */
export interface InvokeExpr extends Spanned {
  readonly kind: 'invoke';
  /** 'IEX', '&', '.' or 'Invoke'. */
  readonly operator: string;
  /**
   * What is being invoked. Obfuscators compute this rather than writing it,
   * as in `&($ShellId[1]+$ShellId[13]+'X')(payload)` - the callee spells
   * "ieX" and the payload is a separate group.
   */
  readonly callee: Expr;
  /** The script being run, when it is written separately from the callee. */
  readonly argument: Expr;
}

export interface UnsupportedExpr extends Spanned {
  readonly kind: 'unsupported';
  /** Source text, so the gap report can name what is missing. */
  readonly text: string;
  readonly reason: string;
}
