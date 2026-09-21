// Rewrites a script to a canonical spelling without changing its meaning.
//
// Obfuscators break identifiers with escape backticks and brace variable names
// that need no bracing. Neither changes what PowerShell does, so undoing them
// is lossless - and it is what an analyst wants to read.
//
//   wRIt`E`-`HOSt "x"   ->  wRItE-HOSt "x"
//   ${a} = 1            ->  $a = 1
//
// Casing is deliberately left alone: it carries no meaning in PowerShell, but
// changing it would misrepresent the sample in the analyst's view.

import { TokenKind } from '../lexer/tokenKind';
import { tokenize } from '../lexer/tokenizer';

/** A plain variable name needs no braces. */
const SIMPLE_VARIABLE = /^[$@]\{([A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z0-9_]+)?)\}$/;

/** A member name that needs no quoting. */
const BARE_MEMBER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function canonicalize(source: string): string | undefined {
  const { tokens } = tokenize(source);
  const pieces: string[] = [];
  let cursor = 0;
  let changed = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    // A string standing where a member name belongs is just a member name:
    // [Convert]::"toBa`Se64STrI`Ng"(...) is [Convert]::toBaSe64STrIng(...).
    // Unquoting it is lossless and is what an analyst wants to read.
    const previous = tokens[i - 1];
    if (
      previous &&
      (previous.kind === TokenKind.ColonColon || previous.kind === TokenKind.Dot) &&
      (token.kind === TokenKind.StringLiteral || token.kind === TokenKind.StringExpandable)
    ) {
      const name = String(token.value ?? '').replace(/`/g, '');
      if (BARE_MEMBER.test(name)) {
        pieces.push(source.slice(cursor, token.start), name);
        cursor = token.end;
        changed = true;
        continue;
      }
    }

    // `$x.Method.Invoke(args)` is the same call as `$x.Method(args)`:
    // PowerShell lets you take a method reference and invoke it. Dropping the
    // '.Invoke' is lossless and removes a layer of indirection the analyst
    // does not need to read.
    if (
      previous &&
      previous.kind === TokenKind.Dot &&
      (token.kind === TokenKind.Identifier || token.kind === TokenKind.Generic) &&
      token.text.toLowerCase() === 'invoke' &&
      tokens[i + 1]?.kind === TokenKind.LParen
    ) {
      const beforeDot = tokens[i - 2];
      if (
        beforeDot &&
        (beforeDot.kind === TokenKind.Identifier ||
          beforeDot.kind === TokenKind.Generic ||
          beforeDot.kind === TokenKind.StringLiteral ||
          beforeDot.kind === TokenKind.StringExpandable)
      ) {
        pieces.push(source.slice(cursor, previous.start));
        cursor = token.end;
        changed = true;
        continue;
      }
    }

    const replacement = canonicalToken(token.kind, token.text);
    if (replacement === undefined) continue;

    pieces.push(source.slice(cursor, token.start), replacement);
    cursor = token.end;
    changed = true;
  }

  if (!changed) return undefined;
  pieces.push(source.slice(cursor));
  return pieces.join('');
}

function canonicalToken(kind: TokenKind, text: string): string | undefined {
  switch (kind) {
    case TokenKind.Generic:
    case TokenKind.Identifier:
    case TokenKind.Parameter: {
      // A backtick inside a bareword only escapes the next character, so
      // dropping it recovers the real name.
      if (!text.includes('`')) return undefined;
      return text.replace(/`/g, '');
    }

    case TokenKind.Variable:
    case TokenKind.SplattedVariable: {
      // Braces and escape backticks can both be present: ${T`AR`GEt} is
      // $TARGEt. Strip the backticks before deciding whether the braces are
      // needed at all.
      const debackticked = text.includes('`') ? text.replace(/`/g, '') : text;
      const match = SIMPLE_VARIABLE.exec(debackticked);
      if (match) return `${text.startsWith('@') ? '@' : '$'}${match[1]}`;
      return debackticked === text ? undefined : debackticked;
    }

    default:
      return undefined;
  }
}
