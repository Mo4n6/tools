// A precedence-climbing expression parser over the token stream.
//
// Scope is expressions, because phase 1 unwraps encoding layers and those are
// expressions. Anything it cannot read becomes an `unsupported` node carrying
// its source text, so the gap report names it rather than losing it.

import { TokenKind, binaryPrecedence } from '../lexer/tokenKind';
import type { Token } from '../lexer/token';
import { tokenize } from '../lexer/tokenizer';
import type { Expr } from './ast';

/** Tokens that carry no meaning for expression parsing. */
const TRIVIA = new Set([TokenKind.Comment, TokenKind.LineContinuation, TokenKind.NewLine]);

/** Command names that re-enter the interpreter with their argument. */
const INVOKE_COMMANDS = new Set(['iex', 'invoke-expression']);

export interface ParseResult {
  readonly expression: Expr;
  /** Tokens left unconsumed, which usually means a statement, not an expression. */
  readonly remaining: number;
}

/**
 * How deep expression nesting may go before the parser gives up.
 *
 * A recursive-descent parser recurses once per nesting level, so deeply
 * nested input overflows the JS stack - which is a hang, not an error, and
 * exactly the anti-analysis behaviour the worker budgets exist to prevent.
 * Real scripts do not come close to this.
 */
const MAX_DEPTH = 200;

class Parser {
  private index = 0;
  private depth = 0;
  private readonly tokens: readonly Token[];

  constructor(
    tokens: readonly Token[],
    private readonly source: string,
  ) {
    this.tokens = tokens.filter((t) => !TRIVIA.has(t.kind));
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  private get kind(): TokenKind {
    return this.peek()?.kind ?? TokenKind.EndOfInput;
  }

  private next(): Token | undefined {
    return this.tokens[this.index++];
  }

  private at(kind: TokenKind): boolean {
    return this.kind === kind;
  }

  private eat(kind: TokenKind): boolean {
    if (this.at(kind)) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private span(from: Token | undefined, to?: Token): { start: number; end: number } {
    const start = from?.start ?? 0;
    const end = to?.end ?? this.tokens[this.index - 1]?.end ?? start;
    return { start, end };
  }

  private unsupported(from: Token | undefined, reason: string): Expr {
    const start = from?.start ?? 0;
    // Consume to the next separator so parsing can continue past the problem.
    while (
      !this.at(TokenKind.EndOfInput) &&
      !this.at(TokenKind.Semi) &&
      !this.at(TokenKind.RParen) &&
      !this.at(TokenKind.Comma)
    ) {
      this.index += 1;
    }
    const end = this.tokens[this.index - 1]?.end ?? start;
    return { kind: 'unsupported', text: this.source.slice(start, end), reason, start, end };
  }

  // --- Entry -------------------------------------------------------------

  parse(): ParseResult {
    const expression = this.parseExpression(0);
    const remaining = this.tokens.filter((t) => t.kind !== TokenKind.EndOfInput).length - this.index;
    return { expression, remaining: Math.max(0, remaining) };
  }

  /** Precedence climbing, using the precedence ported from PowerShell. */
  private parseExpression(minPrecedence: number): Expr {
    if (this.depth >= MAX_DEPTH) {
      return this.unsupported(this.peek(), `expression nested deeper than ${MAX_DEPTH}`);
    }

    this.depth += 1;
    try {
      return this.parseExpressionInner(minPrecedence);
    } finally {
      this.depth -= 1;
    }
  }

  private parseExpressionInner(minPrecedence: number): Expr {
    let left = this.parseUnary();

    for (;;) {
      const op = this.kind;
      const precedence = binaryPrecedence(op);
      if (precedence === 0 || precedence < minPrecedence) break;

      const opToken = this.next()!;
      let right = this.parseExpression(precedence + 1);

      // `-f 'a','b','c'` and `-join`/`-replace` take a comma list as their
      // right operand, so gather one here rather than stopping at the comma.
      if (this.at(TokenKind.Comma)) {
        const items: Expr[] = [right];
        while (this.eat(TokenKind.Comma)) items.push(this.parseExpression(precedence + 1));
        right = {
          kind: 'array',
          items,
          start: right.start,
          end: items[items.length - 1].end,
        };
      }

      left = {
        kind: 'binary',
        op: opToken.kind,
        left,
        right,
        start: left.start,
        end: right.end,
      };
    }

    // A bare comma list, e.g. `'a','b','c'`.
    if (this.at(TokenKind.Comma) && minPrecedence === 0) {
      const items: Expr[] = [left];
      while (this.eat(TokenKind.Comma)) items.push(this.parseExpression(1));
      return {
        kind: 'array',
        items,
        start: left.start,
        end: items[items.length - 1].end,
      };
    }

    return left;
  }

  private parseUnary(): Expr {
    const token = this.peek();
    if (!token) return this.unsupported(token, 'unexpected end of input');

    if (token.kind === TokenKind.Minus || token.kind === TokenKind.Not || token.kind === TokenKind.Bnot) {
      this.index += 1;
      const operand = this.parseUnary();
      return { kind: 'unary', op: token.kind, operand, start: token.start, end: operand.end };
    }

    // A cast or type literal: [Type]expr or [Type]::Member
    if (token.kind === TokenKind.LBracket) {
      const saved = this.index;
      this.index += 1;
      const typeName = this.readTypeName();
      if (typeName !== undefined && this.eat(TokenKind.RBracket)) {
        if (this.eat(TokenKind.ColonColon)) {
          return this.parseStaticMember(token, typeName);
        }
        // A cast binds to the expression that follows it.
        if (this.startsExpression()) {
          const operand = this.parseUnary();
          return {
            kind: 'cast',
            typeName,
            operand,
            start: token.start,
            end: operand.end,
          };
        }
        return { kind: 'literal', value: typeName, ...this.span(token) };
      }
      this.index = saved;
    }

    return this.parsePostfix(this.parsePrimary());
  }

  /** True when the current token could begin an expression. */
  private startsExpression(): boolean {
    switch (this.kind) {
      case TokenKind.Number:
      case TokenKind.Variable:
      case TokenKind.StringLiteral:
      case TokenKind.StringExpandable:
      case TokenKind.HereStringLiteral:
      case TokenKind.HereStringExpandable:
      case TokenKind.LParen:
      case TokenKind.DollarParen:
      case TokenKind.AtParen:
      case TokenKind.LBracket:
      case TokenKind.Identifier:
      case TokenKind.Generic:
      case TokenKind.Minus:
        return true;
      default:
        return false;
    }
  }

  /** Reads a dotted type name inside brackets, including generics. */
  private readTypeName(): string | undefined {
    const parts: string[] = [];
    let depth = 0;

    for (;;) {
      const token = this.peek();
      if (!token) return undefined;
      if (token.kind === TokenKind.RBracket && depth === 0) break;
      if (token.kind === TokenKind.EndOfInput) return undefined;

      if (token.kind === TokenKind.LBracket) depth += 1;
      else if (token.kind === TokenKind.RBracket) depth -= 1;

      parts.push(token.text);
      this.index += 1;
    }

    if (parts.length === 0) return undefined;
    return parts.join('');
  }

  private parseStaticMember(open: Token, typeName: string): Expr {
    const nameToken = this.next();
    if (!nameToken) return this.unsupported(open, 'expected a static member name');
    const name = memberNameOf(nameToken);

    let node: Expr;
    if (this.at(TokenKind.LParen)) {
      const args = this.parseArguments();
      node = { kind: 'static', typeName, name, args, start: open.start, end: this.span(open).end };
    } else {
      node = { kind: 'static', typeName, name, start: open.start, end: nameToken.end };
    }
    return this.parsePostfix(node);
  }

  private parseArguments(): Expr[] {
    const args: Expr[] = [];
    this.eat(TokenKind.LParen);
    if (this.eat(TokenKind.RParen)) return args;

    for (;;) {
      args.push(this.parseExpression(1));
      if (this.eat(TokenKind.Comma)) continue;
      this.eat(TokenKind.RParen);
      break;
    }
    return args;
  }

  private parsePrimary(): Expr {
    const token = this.next();
    if (!token) return this.unsupported(token, 'unexpected end of input');

    switch (token.kind) {
      case TokenKind.Number:
        return { kind: 'literal', value: (token.value as number) ?? 0, ...this.span(token, token) };

      case TokenKind.StringLiteral:
      case TokenKind.HereStringLiteral:
        return { kind: 'literal', value: (token.value as string) ?? '', ...this.span(token, token) };

      case TokenKind.StringExpandable:
      case TokenKind.HereStringExpandable: {
        const text = (token.value as string) ?? '';
        // Interpolation needs the evaluator; a plain string does not.
        if (/[$`]/.test(text)) {
          return {
            kind: 'unsupported',
            text,
            reason: 'string interpolation',
            start: token.start,
            end: token.end,
          };
        }
        return { kind: 'literal', value: text, ...this.span(token, token) };
      }

      case TokenKind.Variable:
        return {
          kind: 'variable',
          name: token.text.replace(/^[$@]\{?/, '').replace(/\}$/, '').toLowerCase(),
          ...this.span(token, token),
        };

      case TokenKind.LParen:
      case TokenKind.DollarParen:
      case TokenKind.AtParen: {
        const inner = this.parseExpression(0);
        const closed = this.at(TokenKind.RParen);
        this.eat(TokenKind.RParen);
        // The span covers the brackets, not just what is inside them, so a
        // caller rewriting this group replaces the whole thing.
        return {
          ...inner,
          start: token.start,
          end: closed ? (this.tokens[this.index - 1]?.end ?? inner.end) : inner.end,
        };
      }

      case TokenKind.Identifier:
      case TokenKind.Generic: {
        const lowered = token.text.toLowerCase();
        if (INVOKE_COMMANDS.has(lowered)) {
          const argument = this.parseExpression(0);
          return {
            kind: 'invoke',
            operator: 'IEX',
            callee: { kind: 'literal', value: 'IEX', start: token.start, end: token.end },
            argument,
            start: token.start,
            end: argument.end,
          };
        }
        return this.unsupported(token, `command '${token.text}'`);
      }

      case TokenKind.Ampersand:
      case TokenKind.Dot: {
        // '&' takes the thing to run, then its arguments. When the callee is a
        // computed name the payload is the group that follows it, so read both
        // rather than mistaking the callee for the script.
        const callee = this.parseUnary();
        const argument = this.at(TokenKind.LParen) ? this.parseExpression(0) : callee;
        return {
          kind: 'invoke',
          operator: token.text,
          callee,
          argument,
          start: token.start,
          end: argument.end,
        };
      }

      default:
        return this.unsupported(token, `token ${TokenKind[token.kind]}`);
    }
  }

  /** Trailing `.Member`, `.Member(...)`, `[index]` and `::Member`. */
  private parsePostfix(target: Expr): Expr {
    let node = target;

    for (;;) {
      if (this.at(TokenKind.Dot) || this.at(TokenKind.QuestionDot)) {
        const dot = this.next()!;
        const nameToken = this.next();
        if (!nameToken) return this.unsupported(dot, 'expected a member name');

        const name = memberNameOf(nameToken);
        if (this.at(TokenKind.LParen)) {
          const args = this.parseArguments();
          node = {
            kind: 'member',
            target: node,
            name,
            args,
            start: node.start,
            end: this.tokens[this.index - 1]?.end ?? nameToken.end,
          };
        } else {
          node = { kind: 'member', target: node, name, start: node.start, end: nameToken.end };
        }
        continue;
      }

      if (this.at(TokenKind.LBracket) || this.at(TokenKind.QuestionLBracket)) {
        this.index += 1;
        const index = this.parseExpression(0);
        this.eat(TokenKind.RBracket);
        node = {
          kind: 'index',
          target: node,
          index,
          start: node.start,
          end: this.tokens[this.index - 1]?.end ?? index.end,
        };
        continue;
      }

      if (this.at(TokenKind.ColonColon)) {
        this.index += 1;
        const nameToken = this.next();
        if (!nameToken) break;
        const typeName = node.kind === 'literal' ? String(node.value) : '';
        const args = this.at(TokenKind.LParen) ? this.parseArguments() : undefined;
        node = {
          kind: 'static',
          typeName,
          name: memberNameOf(nameToken),
          ...(args ? { args } : {}),
          start: node.start,
          end: this.tokens[this.index - 1]?.end ?? nameToken.end,
        };
        continue;
      }

      break;
    }

    return node;
  }
}

/**
 * A member name, however it is spelled. Obfuscators write it as a string and
 * break it with escape backticks: `[Text.Encoding]::"u`Tf8"` is UTF8.
 */
function memberNameOf(token: Token): string {
  const raw = typeof token.value === 'string' ? token.value : token.text;
  return raw.replace(/`/g, '');
}

/** Parse PowerShell source as a single expression. */
export function parseExpression(source: string): ParseResult {
  return new Parser(tokenize(source).tokens, source).parse();
}

/** Parse an already-tokenized expression. */
export function parseTokens(tokens: readonly Token[], source: string): ParseResult {
  return new Parser(tokens, source).parse();
}
