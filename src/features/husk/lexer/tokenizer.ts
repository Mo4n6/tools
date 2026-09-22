// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// The Husk PowerShell tokenizer.
//
// Scope is the subset obfuscated commodity droppers emit, not all of
// PowerShell. Anything outside that should produce a recorded diagnostic
// rather than a wrong token: see docs/husk-spec.md section 3, commitment 2.
//
// Correctness is established by differential testing against the real
// PowerShell tokenizer rather than by reading the grammar - see
// ./__tests__/tokenizer.oracle.test.ts and corpus/fixtures/lexer-oracle.json.

import {
  forceStartNewToken,
  forceStartNewTokenAfterNumber,
  isDash,
  isDecimalDigit,
  isDoubleQuote,
  isHexDigit,
  isIdentifierFollow,
  isIdentifierStart,
  isNewline,
  isSingleQuote,
  isVariableStart,
  isWhitespace,
} from './chars';
import { DASHED_OPERATORS, KEYWORDS, TokenKind } from './tokenKind';
import {
  TokenizerMode,
  type Token,
  type TokenizeResult,
  type TokenizerDiagnostic,
} from './token';

/** Characters that end a bareword in command (argument) mode. */
const COMMAND_TERMINATORS = new Set([
  '|', ';', ')', '}', ']', ',', '\r', '\n', '>', '<',
]);

/** Single characters that map directly to a punctuator token. */
const SIMPLE_PUNCTUATORS: Readonly<Record<string, TokenKind>> = {
  '(': TokenKind.LParen,
  ')': TokenKind.RParen,
  '{': TokenKind.LCurly,
  '}': TokenKind.RCurly,
  '[': TokenKind.LBracket,
  ']': TokenKind.RBracket,
  ';': TokenKind.Semi,
  ',': TokenKind.Comma,
  '|': TokenKind.Pipe,
  '&': TokenKind.Ampersand,
};

class Tokenizer {
  private pos = 0;
  private mode = TokenizerMode.Expression;
  /** Open '[' count while in TypeName mode, so generics nest correctly. */
  private typeDepth = 0;
  private parenDepth = 0;
  /**
   * Mode in effect when each open paren was seen. A '(' opened while reading
   * a command's arguments returns to command mode when it closes, so
   * `Set-Item (expr) -Param` keeps -Param a parameter; one opened in
   * expression mode returns to expression mode, so `(Get-Thing).Name` is
   * member access.
   */
  private readonly parenModes: TokenizerMode[] = [];
  /**
   * Paren depth at which an '&' or '.' invocation is waiting for its callee to
   * close. Obfuscators write `&('Wri'+'te-Output') -Arg`, so the arguments
   * after the callee expression are command mode, not expression mode.
   */
  private pendingInvokeDepth: number | null = null;
  private readonly tokens: Token[] = [];
  private readonly diagnostics: TokenizerDiagnostic[] = [];

  /**
   * Nesting depth of `$(` and `@(` inside the current string, so a quote in a
   * subexpression does not terminate the string that contains it.
   */
  constructor(private readonly source: string) {}

  // --- Scanner primitives -------------------------------------------------

  private get atEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private peek(offset = 0): string {
    return this.source[this.pos + offset] ?? '';
  }

  private advance(): string {
    return this.source[this.pos++] ?? '';
  }


  private emit(kind: TokenKind, start: number, value?: string | number): Token {
    const token: Token = {
      kind,
      text: this.source.slice(start, this.pos),
      start,
      end: this.pos,
      ...(value !== undefined ? { value } : {}),
    };
    this.tokens.push(token);
    return token;
  }

  private diagnose(message: string, start: number): void {
    this.diagnostics.push({ message, start, end: this.pos });
  }

  // --- Mode tracking ------------------------------------------------------
  //
  // The real tokenizer is told its mode by the parser. Husk approximates:
  // a bareword or '&'/'.' invocation in statement position starts a command,
  // and the command runs until a pipeline or statement separator.


  private openParen(): void {
    this.parenDepth += 1;
    this.parenModes.push(this.mode);
  }

  /** Closes a paren and returns the mode that was in effect when it opened. */
  private closeParen(): TokenizerMode {
    this.parenDepth = Math.max(0, this.parenDepth - 1);
    return this.parenModes.pop() ?? TokenizerMode.Expression;
  }

  private enterCommandMode(): void {
    this.mode = TokenizerMode.Command;
  }

  private enterExpressionMode(): void {
    this.mode = TokenizerMode.Expression;
  }

  // --- Entry point --------------------------------------------------------

  tokenize(): TokenizeResult {
    let guard = 0;
    const limit = this.source.length * 4 + 1024;

    while (!this.atEnd) {
      const before = this.pos;
      this.scanToken();

      if (this.pos === before) {
        // Nothing consumed: emit the character as Unknown so scanning always
        // advances. A tokenizer that can stall would hang the worker.
        this.pos += 1;
        this.emit(TokenKind.Unknown, before);
        this.diagnose(`unexpected character ${JSON.stringify(this.source[before])}`, before);
      }

      guard += 1;
      if (guard > limit) {
        this.diagnose('tokenizer exceeded its step budget', this.pos);
        break;
      }
    }

    this.emit(TokenKind.EndOfInput, this.pos);
    return { tokens: this.tokens, diagnostics: this.diagnostics };
  }

  private scanToken(): void {
    const start = this.pos;
    const c = this.peek();

    // Line continuation: a backtick immediately before a newline.
    if (c === '`' && isNewline(this.peek(1))) {
      this.advance();
      this.consumeNewline();
      this.emit(TokenKind.LineContinuation, start);
      return;
    }

    if (isWhitespace(c)) {
      while (!this.atEnd && isWhitespace(this.peek())) this.advance();
      return; // whitespace is not a token
    }

    if (isNewline(c)) {
      this.consumeNewline();
      this.emit(TokenKind.NewLine, start);
      this.enterExpressionMode();
      return;
    }

    if (c === '#') return this.scanLineComment(start);
    if (c === '<' && this.peek(1) === '#') return this.scanBlockComment(start);

    if (c === '@' && (this.peek(1) === "'" || this.peek(1) === '"')) {
      return this.scanHereString(start);
    }
    if (isSingleQuote(c)) return this.scanSingleQuotedString(start);
    if (isDoubleQuote(c)) return this.scanDoubleQuotedString(start);

    if (c === '$' && this.peek(1) === '(') {
      this.pos += 2;
      this.openParen();
      this.emit(TokenKind.DollarParen, start);
      this.enterExpressionMode();
      return;
    }
    if (c === '@' && this.peek(1) === '(') {
      this.pos += 2;
      this.openParen();
      this.emit(TokenKind.AtParen, start);
      this.enterExpressionMode();
      return;
    }
    if (c === '@' && this.peek(1) === '{') {
      this.pos += 2;
      this.emit(TokenKind.AtCurly, start);
      this.enterExpressionMode();
      return;
    }
    if (c === '$' || (c === '@' && isVariableStart(this.peek(1)))) {
      return this.scanVariable(start);
    }

    // A '[' opens a type literal, except after something that produces a
    // value - there it indexes, as in $ShellId[1].
    if (
      c === '[' &&
      (this.mode === TokenizerMode.TypeName ||
        (this.mode === TokenizerMode.Expression && !this.afterValue()))
    ) {
      this.advance();
      this.emit(TokenKind.LBracket, start);
      this.typeDepth += 1;
      this.mode = TokenizerMode.TypeName;
      return;
    }
    if (c === ']' && this.mode === TokenizerMode.TypeName) {
      this.advance();
      this.emit(TokenKind.RBracket, start);
      this.typeDepth -= 1;
      if (this.typeDepth <= 0) {
        this.typeDepth = 0;
        // A closed type literal is a value, so what follows is an expression:
        // this is what makes [char]34 scan its 34 as a number.
        this.enterExpressionMode();
      }
      return;
    }
    if (this.mode === TokenizerMode.TypeName) return this.scanTypeName(start);

    if (this.mode === TokenizerMode.Command) {
      // In command mode a leading dash introduces a parameter, and anything
      // else that is not punctuation is an argument - including '-5', which
      // is an argument rather than a negated number.
      if (isDash(c) && this.isParameterStart()) return this.scanParameter(start);
      if (this.scanRedirection(start)) return;
      if (isDecimalDigit(c)) return this.scanNumber(start);
      if (isIdentifierStart(c) || c === '_') return this.scanBareword(start);
      if (!SIMPLE_PUNCTUATORS[c] && !this.isDashOperatorHere()) {
        return this.scanCommandArgument(start);
      }
    }

    if (isDecimalDigit(c) || (c === '.' && isDecimalDigit(this.peek(1)))) {
      return this.scanNumber(start);
    }

    if (c === ':' && this.peek(1) !== ':' && this.startsStatement()) {
      return this.scanLabel(start);
    }
    if (isDash(c)) return this.scanDashOperator(start);
    if (this.scanRedirection(start)) return;
    if (this.scanSymbolicOperator(start)) return;

    const punctuator = SIMPLE_PUNCTUATORS[c];
    if (punctuator !== undefined) {
      this.advance();
      if (punctuator === TokenKind.LParen) this.openParen();
      this.emit(punctuator, start);
      if (punctuator === TokenKind.RParen) {
        const restored = this.closeParen();
        if (this.pendingInvokeDepth !== null && this.parenDepth === this.pendingInvokeDepth) {
          this.pendingInvokeDepth = null;
          // '(...).Replace(' and '(...)::Member' are member access on the
          // result, not arguments to an invocation.
          if (!this.nextIsMemberAccess()) {
            this.enterCommandMode();
            return;
          }
        }
        this.mode = restored;
        return;
      }
      this.onPunctuator(punctuator);
      return;
    }

    if (isIdentifierStart(c) || c === '_') {
      // The real tokenizer is told 'command mode' by its parser before the
      // command name is scanned. Do the same, or 'New-Object' splits at the
      // dash before we ever notice it is a command.
      if (this.mode === TokenizerMode.Expression && this.startsStatement()) {
        this.enterCommandMode();
      }
      return this.scanBareword(start);
    }
  }

  private onPunctuator(kind: TokenKind): void {
    switch (kind) {
      case TokenKind.LParen:
      case TokenKind.LCurly:
      case TokenKind.Comma:
      case TokenKind.Pipe:
      case TokenKind.Semi:
      case TokenKind.LBracket:
        this.enterExpressionMode();
        break;
      case TokenKind.RBracket:
      case TokenKind.RCurly:
        this.enterExpressionMode();
        break;
      case TokenKind.Ampersand:
        // '& command args' - the callee is scanned as an expression, its
        // arguments as a command once the callee closes.
        this.enterExpressionMode();
        this.pendingInvokeDepth = this.parenDepth;
        break;
      default:
        break;
    }
  }

  private consumeNewline(): void {
    if (this.peek() === '\r' && this.peek(1) === '\n') {
      this.pos += 2;
      return;
    }
    this.advance();
  }

  // --- Comments -----------------------------------------------------------

  private scanLineComment(start: number): void {
    while (!this.atEnd && !isNewline(this.peek())) this.advance();
    this.emit(TokenKind.Comment, start);
  }

  private scanBlockComment(start: number): void {
    this.pos += 2; // '<#'
    while (!this.atEnd) {
      if (this.peek() === '#' && this.peek(1) === '>') {
        this.pos += 2;
        this.emit(TokenKind.Comment, start);
        return;
      }
      this.advance();
    }
    this.emit(TokenKind.Comment, start);
    this.diagnose('unterminated block comment', start);
  }

  // --- Strings ------------------------------------------------------------

  private scanSingleQuotedString(start: number): void {
    const quote = this.advance();
    let value = '';

    while (!this.atEnd) {
      const c = this.advance();
      if (isSingleQuote(c)) {
        // Two quotes in a row are an escaped quote, not a terminator.
        if (isSingleQuote(this.peek())) {
          value += "'";
          this.advance();
          continue;
        }
        this.emit(TokenKind.StringLiteral, start, value);
        return;
      }
      value += c;
    }

    this.emit(TokenKind.StringLiteral, start, value);
    this.diagnose(`unterminated string started with ${JSON.stringify(quote)}`, start);
  }

  private scanDoubleQuotedString(start: number): void {
    this.advance();
    let value = '';
    let subexpressionDepth = 0;

    while (!this.atEnd) {
      const c = this.peek();

      // A quote inside $( ... ) belongs to the subexpression, not to us.
      if (c === '$' && this.peek(1) === '(') {
        subexpressionDepth += 1;
        value += this.advance();
        value += this.advance();
        continue;
      }
      if (subexpressionDepth > 0) {
        if (c === '(') subexpressionDepth += 1;
        else if (c === ')') subexpressionDepth -= 1;
        value += this.advance();
        continue;
      }

      if (c === '`') {
        this.advance();
        value += this.decodeEscape(this.advance());
        continue;
      }
      if (isDoubleQuote(c)) {
        this.advance();
        if (isDoubleQuote(this.peek())) {
          value += '"';
          this.advance();
          continue;
        }
        this.emit(TokenKind.StringExpandable, start, value);
        return;
      }
      value += this.advance();
    }

    this.emit(TokenKind.StringExpandable, start, value);
    this.diagnose('unterminated expandable string', start);
  }

  /**
   * Backtick escapes, using **Windows PowerShell 5.1** rules.
   *
   * This is deliberate: commodity droppers target the PowerShell built into
   * Windows, and 5.1 has no `e escape. PowerShell 6 added it, so decoding
   * 5.1-targeted obfuscation with 6+ rules turns the 'e' in a backtick-broken
   * identifier into an ESC character and silently corrupts the name -
   * `"tOBA`s`e64St`RINg"` stops being a valid member name.
   *
   * Unknown escapes yield the literal character, which is also 5.1 behaviour.
   */
  private decodeEscape(c: string): string {
    switch (c) {
      case '0': return '\0';
      case 'a': return '\x07';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'v': return '\v';
      default: return c;
    }
  }

  private scanHereString(start: number): void {
    this.advance(); // '@'
    const quote = this.advance();
    const expandable = isDoubleQuote(quote);

    // The opening line ends after the quote; content starts on the next line.
    while (!this.atEnd && !isNewline(this.peek())) this.advance();
    if (!this.atEnd) this.consumeNewline();

    const contentStart = this.pos;
    const closer = expandable ? '"@' : "'@";

    while (!this.atEnd) {
      // The terminator is only a terminator at the start of a line.
      const atLineStart = this.pos === 0 || isNewline(this.source[this.pos - 1]);
      if (atLineStart && this.source.startsWith(closer, this.pos)) {
        const value = this.source.slice(contentStart, this.pos).replace(/\r?\n$/, '');
        this.pos += 2;
        this.emit(
          expandable ? TokenKind.HereStringExpandable : TokenKind.HereStringLiteral,
          start,
          value,
        );
        return;
      }
      this.advance();
    }

    this.emit(
      expandable ? TokenKind.HereStringExpandable : TokenKind.HereStringLiteral,
      start,
      this.source.slice(contentStart),
    );
    this.diagnose('unterminated here-string', start);
  }

  // --- Variables ----------------------------------------------------------

  private scanVariable(start: number): void {
    const splatted = this.peek() === '@';
    this.advance(); // '$' or '@'

    if (this.peek() === '{') {
      this.advance();
      while (!this.atEnd && this.peek() !== '}') this.advance();
      if (this.atEnd) this.diagnose('unterminated braced variable name', start);
      else this.advance();
      this.emit(splatted ? TokenKind.SplattedVariable : TokenKind.Variable, start);
      return;
    }

    // A bare '$' is not a variable.
    if (!isVariableStart(this.peek())) {
      this.emit(TokenKind.Unknown, start);
      this.diagnose('expected a variable name', start);
      return;
    }

    while (!this.atEnd && isIdentifierFollow(this.peek())) this.advance();

    // Scope qualifier, e.g. $env:PATH or $global:x.
    if (this.peek() === ':' && this.peek(1) !== ':') {
      this.advance();
      while (!this.atEnd && isIdentifierFollow(this.peek())) this.advance();
    }

    this.emit(splatted ? TokenKind.SplattedVariable : TokenKind.Variable, start);
  }

  // --- Numbers ------------------------------------------------------------

  private scanNumber(start: number): void {
    if (this.peek() === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
      this.pos += 2;
      while (!this.atEnd && (isHexDigit(this.peek()) || this.peek() === '_')) this.advance();
    } else if (this.peek() === '0' && (this.peek(1) === 'b' || this.peek(1) === 'B')) {
      this.pos += 2;
      while (!this.atEnd && /[01_]/.test(this.peek())) this.advance();
    } else {
      while (!this.atEnd && (isDecimalDigit(this.peek()) || this.peek() === '_')) this.advance();
      if (this.peek() === '.' && isDecimalDigit(this.peek(1))) {
        this.advance();
        while (!this.atEnd && isDecimalDigit(this.peek())) this.advance();
      }
      if (this.peek() === 'e' || this.peek() === 'E') {
        const save = this.pos;
        this.advance();
        if (this.peek() === '+' || this.peek() === '-') this.advance();
        if (isDecimalDigit(this.peek())) {
          while (!this.atEnd && isDecimalDigit(this.peek())) this.advance();
        } else {
          this.pos = save;
        }
      }
    }

    // Type suffix (l, d, u, y, s, n) then multiplier (kb, mb, gb, tb, pb).
    while (!this.atEnd && /[lLdDuUyYsSnN]/.test(this.peek())) this.advance();
    const multiplier = /^(kb|mb|gb|tb|pb)/i.exec(this.source.slice(this.pos));
    if (multiplier) this.pos += multiplier[0].length;

    const text = this.source.slice(start, this.pos);

    // '7z' is one token, but '7+' is two - so a letter that is not part of a
    // suffix glues onto the number and makes the whole thing a bareword.
    const next = this.peek();
    if (
      !this.atEnd &&
      !forceStartNewTokenAfterNumber(next) &&
      !forceStartNewToken(next) &&
      !isWhitespace(next) &&
      !isNewline(next)
    ) {
      return this.mode === TokenizerMode.Command
        ? this.scanCommandArgument(start)
        : this.scanBareword(start);
    }

    this.emit(TokenKind.Number, start, parseNumericText(text));
  }

  // --- Operators ----------------------------------------------------------

  private scanDashOperator(start: number): void {
    const remainder = this.source.slice(this.pos);
    const word = /^[-–—―]([A-Za-z]+)/.exec(remainder);

    if (word) {
      const normalized = `-${word[1].toLowerCase()}`;
      const kind = DASHED_OPERATORS.get(normalized);
      if (kind !== undefined) {
        this.pos += word[0].length;
        this.emit(kind, start);
        this.enterExpressionMode();
        return;
      }
    }

    this.advance();
    if (this.peek() === '-') {
      this.advance();
      this.emit(TokenKind.MinusMinus, start);
      return;
    }
    if (this.peek() === '=') {
      this.advance();
      this.emit(TokenKind.MinusEquals, start);
      this.enterExpressionMode();
      return;
    }
    this.emit(TokenKind.Minus, start);
    this.enterExpressionMode();
  }

  /** True when a dash here starts a parameter rather than an operator. */
  private isParameterStart(): boolean {
    const next = this.peek(1);
    if (!isIdentifierStart(next) && next !== '-') return false;

    // '-eq' and friends stay operators even in command mode.
    const word = /^[-–—―]([A-Za-z]+)/.exec(this.source.slice(this.pos));
    if (word && DASHED_OPERATORS.has(`-${word[1].toLowerCase()}`)) return false;

    return true;
  }

  private scanParameter(start: number): void {
    this.advance(); // '-'
    if (this.peek() === '-') this.advance();
    while (!this.atEnd && isIdentifierFollow(this.peek())) this.advance();
    if (this.peek() === ':') this.advance();
    this.emit(TokenKind.Parameter, start);
  }

  private scanRedirection(start: number): boolean {
    const remainder = this.source.slice(this.pos);
    const match = /^(\d?>>|\d?>&\d|\d?>|<)/.exec(remainder);
    if (!match) return false;

    // A lone '<' is reserved rather than a real operator in PowerShell.
    this.pos += match[0].length;
    this.emit(TokenKind.Redirection, start);
    return true;
  }

  private scanSymbolicOperator(start: number): boolean {
    // Captured before emitting, since emitting makes this token the last one
    // and startsStatement() would then be answering about itself.
    const wasStatementStart = this.startsStatement();
    // Longest match first, so '::' beats ':' and '++' beats '+'.
    const operators: ReadonlyArray<readonly [string, TokenKind]> = [
      ['??=', TokenKind.QuestionQuestionEquals],
      ['...', TokenKind.DotDot],
      ['::', TokenKind.ColonColon],
      ['++', TokenKind.PlusPlus],
      ['+=', TokenKind.PlusEquals],
      ['*=', TokenKind.MultiplyEquals],
      ['/=', TokenKind.DivideEquals],
      ['%=', TokenKind.RemainderEquals],
      ['??', TokenKind.QuestionQuestion],
      ['?.', TokenKind.QuestionDot],
      ['?[', TokenKind.QuestionLBracket],
      ['..', TokenKind.DotDot],
      ['+', TokenKind.Plus],
      ['*', TokenKind.Multiply],
      ['/', TokenKind.Divide],
      ['%', TokenKind.Rem],
      ['=', TokenKind.Equals],
      ['?', TokenKind.QuestionMark],
      [':', TokenKind.Colon],
      ['.', TokenKind.Dot],
      ['!', TokenKind.Not],
    ];

    for (const [text, kind] of operators) {
      if (this.source.startsWith(text, this.pos)) {
        // '.' followed by a name is member access; '.' alone in statement
        // position is dot-sourcing, handled by the bareword path.
        this.pos += text.length;
        this.emit(kind, start);
        if (kind === TokenKind.Dot) {
          // '. .\script.ps1' dot-sources: the dot is an invocation operator
          // and what follows is a command, not a member name.
          if (isWhitespace(this.peek())) this.enterCommandMode();
          // '.("Wri"+"te-Output") -Arg' invokes too, so the arguments after
          // the callee expression are command mode.
          else if (this.peek() === '(' && wasStatementStart) {
            this.pendingInvokeDepth = this.parenDepth;
          }
        } else if (kind !== TokenKind.ColonColon) {
          this.enterExpressionMode();
        }
        return true;
      }
    }
    return false;
  }

  // --- Barewords ----------------------------------------------------------

  /** True when what follows the cursor is member access rather than an argument. */
  private nextIsMemberAccess(): boolean {
    let i = this.pos;
    while (i < this.source.length && isWhitespace(this.source[i])) i += 1;
    const c = this.source[i] ?? '';
    return c === '.' || (c === ':' && this.source[i + 1] === ':');
  }

  /** True when the previous significant token produced a value. */
  private afterValue(): boolean {
    for (let i = this.tokens.length - 1; i >= 0; i -= 1) {
      const kind = this.tokens[i].kind;
      if (kind === TokenKind.Comment || kind === TokenKind.LineContinuation) continue;
      switch (kind) {
        case TokenKind.Variable:
        case TokenKind.SplattedVariable:
        case TokenKind.RParen:
        case TokenKind.RBracket:
        case TokenKind.RCurly:
        case TokenKind.Identifier:
        case TokenKind.Generic:
        case TokenKind.Number:
        case TokenKind.StringLiteral:
        case TokenKind.StringExpandable:
        case TokenKind.HereStringLiteral:
        case TokenKind.HereStringExpandable:
          return true;
        default:
          return false;
      }
    }
    return false;
  }

  /** True when nothing but trivia precedes this point on the statement. */
  private startsStatement(): boolean {
    for (let i = this.tokens.length - 1; i >= 0; i -= 1) {
      const kind = this.tokens[i].kind;
      if (kind === TokenKind.Comment || kind === TokenKind.LineContinuation) continue;
      return (
        kind === TokenKind.NewLine ||
        kind === TokenKind.Semi ||
        kind === TokenKind.Pipe ||
        kind === TokenKind.LCurly ||
        kind === TokenKind.LParen ||
        kind === TokenKind.DollarParen ||
        kind === TokenKind.AtParen
      );
    }
    return true;
  }

  /** True when a dash here begins a known dashed operator such as -eq. */
  private isDashOperatorHere(): boolean {
    if (!isDash(this.peek())) return false;
    const word = /^[-\u2013\u2014\u2015]([A-Za-z]+)/.exec(this.source.slice(this.pos));
    return word !== null && DASHED_OPERATORS.has(`-${word[1].toLowerCase()}`);
  }

  /** A loop label, e.g. ':outer'. */
  private scanLabel(start: number): void {
    this.advance(); // ':'
    while (!this.atEnd && isIdentifierFollow(this.peek())) this.advance();
    this.emit(TokenKind.Label, start);
  }

  /**
   * A name inside a type literal. Dots and nested namespaces are part of the
   * name, and keywords are not keywords here.
   */
  private scanTypeName(start: number): void {
    while (!this.atEnd) {
      const c = this.peek();
      if (isIdentifierFollow(c) || c === '.' || c === '+' || c === '`') {
        this.advance();
        continue;
      }
      break;
    }

    if (this.pos === start) {
      // Not a name - commas in generics, whitespace, anything else. Let the
      // ordinary scanners handle it in expression mode for this one token.
      const saved = this.mode;
      this.mode = TokenizerMode.Expression;
      this.scanToken();
      this.mode = saved;
      return;
    }
    this.emit(TokenKind.Identifier, start);
  }

  private scanBareword(start: number): void {
    this.pos = start;
    const commandLike = this.mode === TokenizerMode.Command;
    const commandName = commandLike && this.startsStatement();
    let sawNonIdentifier = false;

    while (!this.atEnd) {
      const c = this.peek();
      if (c === '`') {
        // A backtick escapes the next character into the bareword, which is
        // how 'Wri`te-Ho`st' stays a single command name.
        sawNonIdentifier = true;
        this.advance();
        if (!this.atEnd) this.advance();
        continue;
      }
      if (isIdentifierFollow(c)) {
        this.advance();
        continue;
      }
      // Only a command name or argument absorbs these. In expression mode a
      // '.' is member access, so [Text.Encoding]::UTF8.GetBytes() yields
      // ColonColon Identifier Dot Identifier rather than one Generic.
      if (commandLike && (c === '-' || c === '.' || c === '\\' || c === '/' || c === ':')) {
        if (c === ':' && this.peek(1) === ':') break;
        sawNonIdentifier = true;
        this.advance();
        continue;
      }
      break;
    }

    if (this.pos === start) {
      this.advance();
      this.emit(TokenKind.Unknown, start);
      return;
    }

    const text = this.source.slice(start, this.pos);

    // A trailing ':' on an otherwise plain word is a label.
    if (text.endsWith(':') && !text.slice(0, -1).includes(':')) {
      this.emit(TokenKind.Label, start);
      return;
    }

    const keyword = KEYWORDS.get(text.toLowerCase());
    if (keyword !== undefined && (this.mode === TokenizerMode.Expression || commandName)) {
      this.emit(keyword, start);
      this.enterExpressionMode();
      return;
    }

    const kind = sawNonIdentifier ? TokenKind.Generic : TokenKind.Identifier;
    this.emit(kind, start);
  }


  private scanCommandArgument(start: number): void {
    while (!this.atEnd) {
      const c = this.peek();
      if (isWhitespace(c) || isNewline(c)) break;
      if (COMMAND_TERMINATORS.has(c)) break;
      if (c === '`') {
        this.advance();
        if (!this.atEnd) this.advance();
        continue;
      }
      // A quote part-way through an argument opens a quoted *section* of the
      // same argument rather than a new string token, so whitespace inside it
      // does not end the argument. This is what makes
      //   powershell "...-bxOr "0x3b")}) -joIN '') "
      // tokenize its tail as one Generic.
      if (isSingleQuote(c) || isDoubleQuote(c)) {
        const closer = isSingleQuote(c) ? isSingleQuote : isDoubleQuote;
        this.advance();
        while (!this.atEnd && !closer(this.peek())) {
          if (this.peek() === '`') this.advance();
          this.advance();
        }
        if (!this.atEnd) this.advance();
        continue;
      }
      if (c === '$') break;
      this.advance();
    }

    if (this.pos === start) {
      // Nothing consumable here; fall back to expression scanning.
      this.enterExpressionMode();
      return;
    }
    this.emit(TokenKind.Generic, start);
  }
}

function parseNumericText(text: string): number {
  const cleaned = text.replace(/_/g, '');
  const withoutSuffix = cleaned.replace(/(kb|mb|gb|tb|pb)$/i, '').replace(/[lLdDuUyYsSnN]+$/, '');
  const multiplier = /(kb|mb|gb|tb|pb)$/i.exec(cleaned);

  let base: number;
  if (/^0[xX]/.test(withoutSuffix)) base = Number.parseInt(withoutSuffix.slice(2), 16);
  else if (/^0[bB]/.test(withoutSuffix)) base = Number.parseInt(withoutSuffix.slice(2), 2);
  else base = Number.parseFloat(withoutSuffix);

  if (!Number.isFinite(base)) return Number.NaN;
  if (!multiplier) return base;

  const scale = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4, pb: 1024 ** 5 };
  return base * scale[multiplier[1].toLowerCase() as keyof typeof scale];
}

/** Tokenize PowerShell source. Never throws; problems land in `diagnostics`. */
export function tokenize(source: string): TokenizeResult {
  return new Tokenizer(source).tokenize();
}
