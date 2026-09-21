# Husk

PowerShell deobfuscation and IOC extraction, fully browser-local.

Design spec: [`docs/husk-spec.md`](../../../docs/husk-spec.md).

## Status

Phase 0/1 groundwork. The lexer's character classification and token model are
in place; the tokenizer itself is not yet written.

## Ported code

The files below are **generated** from the MIT-licensed PowerShell source and
must not be edited by hand:

| Generated file | Source | Generator |
|---|---|---|
| `lexer/charTraits.ts` | `CharTraits.cs` | `scripts/port-char-traits.mjs` |
| `lexer/tokenKind.ts` | `token.cs`, `tokenizer.cs` | `scripts/port-tokens.mjs` |

Attribution is recorded in `docs/licenses/husk-manifest.json`.

### Why these are ported rather than written

Three tables in the PowerShell tokenizer are pure data, are long, and are the
kind of thing where a single wrong entry produces a lexer that is subtly wrong
on one input and correct on everything else:

- **The 128-entry character trait table.** Encodes which characters can start
  an identifier, end a number token, or force a token boundary. Also the reason
  Husk handles the Unicode dash and smart-quote look-alikes that PowerShell
  accepts as real syntax and obfuscators use deliberately.
- **Operator precedence.** Carried in the `BinaryPrecedence*` token flags.
  Getting precedence wrong yields an evaluator that computes the wrong answer
  without erroring, which is the worst failure mode this project has.
- **The keyword and dashed-operator lookups.** Note that these come from
  `tokenizer.cs`, not from `token.cs`. The latter holds *display* text, which
  lists only `-ireplace`, while the tokenizer also accepts the bare `-replace`
  that real scripts use. Deriving the lookup from display text produces a lexer
  that fails on ordinary input — a mistake this port made first and the tests
  caught.

### Regenerating

```sh
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/PowerShell/PowerShell.git /tmp/psrc
git -C /tmp/psrc sparse-checkout set src/System.Management.Automation/engine/parser

npm run port:powershell -- /tmp/psrc
```

Both generators validate as they go — table lengths, dense indexing across the
enum's reserved gaps, row labels matching their token kinds, and every
referenced flag existing — and fail loudly rather than emitting a table that is
quietly out of step with the source.

## Tests

```sh
npx vitest run src/features/husk
```
