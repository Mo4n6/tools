// Splits a script into top-level statements.
//
// The pipeline folds expressions, but real samples are several statements:
// `$a = "husk"; &('Wri'+'te-Host') $a`. Without splitting, only the first is
// ever seen, and everything after it is silently skipped - which is the
// failure mode this project exists to avoid.

import { TokenKind } from '../lexer/tokenKind';
import { tokenize } from '../lexer/tokenizer';

export interface Statement {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Splits a statement into its pipeline segments at bracket depth zero.
 *
 * `'payload' | &'iex'` sends its payload *into* the invocation rather than
 * passing it as an argument, which is one of the most common shapes there is.
 * Reading only arguments misses it entirely.
 */
export function splitPipeline(source: string): readonly Statement[] {
  const { tokens } = tokenize(source);
  const segments: Statement[] = [];

  let depth = 0;
  let start = 0;

  const push = (end: number): void => {
    const text = source.slice(start, end);
    if (text.trim().length > 0) segments.push({ text, start, end });
  };

  for (const token of tokens) {
    switch (token.kind) {
      case TokenKind.LParen:
      case TokenKind.LCurly:
      case TokenKind.LBracket:
      case TokenKind.DollarParen:
      case TokenKind.AtParen:
      case TokenKind.AtCurly:
        depth += 1;
        break;

      case TokenKind.RParen:
      case TokenKind.RCurly:
      case TokenKind.RBracket:
        depth = Math.max(0, depth - 1);
        break;

      case TokenKind.Pipe:
        if (depth === 0) {
          push(token.start);
          start = token.end;
        }
        break;

      case TokenKind.EndOfInput:
        push(token.start);
        break;

      default:
        break;
    }
  }

  return segments;
}

/**
 * Statements separated by ';' or a newline, at bracket depth zero. A separator
 * inside brackets belongs to an argument list or a script block, not to the
 * top level.
 */
export function splitStatements(source: string): readonly Statement[] {
  const { tokens } = tokenize(source);
  const statements: Statement[] = [];

  let depth = 0;
  let start = 0;

  const push = (end: number): void => {
    const text = source.slice(start, end);
    if (text.trim().length > 0) statements.push({ text, start, end });
  };

  for (const token of tokens) {
    switch (token.kind) {
      case TokenKind.LParen:
      case TokenKind.LCurly:
      case TokenKind.LBracket:
      case TokenKind.DollarParen:
      case TokenKind.AtParen:
      case TokenKind.AtCurly:
        depth += 1;
        break;

      case TokenKind.RParen:
      case TokenKind.RCurly:
      case TokenKind.RBracket:
        depth = Math.max(0, depth - 1);
        break;

      case TokenKind.Semi:
      case TokenKind.NewLine:
        if (depth === 0) {
          push(token.start);
          start = token.end;
        }
        break;

      case TokenKind.EndOfInput:
        push(token.start);
        break;

      default:
        break;
    }
  }

  if (statements.length === 0 && source.trim().length > 0) {
    statements.push({ text: source, start: 0, end: source.length });
  }
  return statements;
}
