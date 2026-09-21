# Husk

PowerShell deobfuscation and IOC extraction, fully browser-local.

Design spec: [`docs/husk-spec.md`](../../../docs/husk-spec.md).

## Status

Phase 0 complete; phase 1 not started. Target corpus is commodity IR — see
[spec section 9](../../../docs/husk-spec.md).

- `core/` — the taint-aware value model, gap ledger and execution trace.
- `corpus/` — generated ground truth. Test-only; never imported by the app.
- `lexer/` — character classification and the token model. The tokenizer
  itself is not yet written.

## `corpus/`

Ground truth we did not author, so a fixture cannot encode the same
misunderstanding as the code it tests. Both files are generated and committed,
so tests run without PowerShell installed.

| File | Contents | Generator |
|---|---|---|
| `fixtures/invoke-obfuscation.json` | 244 (obfuscated, expected) pairs across 17 transforms | `scripts/husk/generate-corpus.ps1` |
| `fixtures/lexer-oracle.json` | 269 cases, ~7.4k ground-truth tokens from the real PowerShell tokenizer | `scripts/husk/generate-lexer-oracle.ps1` |

```sh
npm run husk:corpus -- -InvokeObfuscationPath /path/to/Invoke-Obfuscation
npm run husk:oracle
```

Requires `pwsh` and a clone of
[Invoke-Obfuscation](https://github.com/danielbohannon/Invoke-Obfuscation).
Payloads are benign by design — no malware is committed here.

### Two things worth knowing

**No-ops are dropped at generation.** `Out-ObfuscatedTokenCommand` only
transforms the token type it is asked for, so a payload with no member access
returns byte-identical output for `-TokenTypeToObfuscate Member`. The first
corpus run was 42% such fixtures. They are worse than useless: a deobfuscator
that did nothing would pass them and inflate the coverage number. The
`all-token-types` payload exists so every token type has something to work on.

**Five oracle cases have `errorCount > 0`.** Those are
`Out-EncodedSpecialCharOnlyCommand` launchers, which wrap their payload for
`cmd.exe` and so are not standalone PowerShell. `lexableCases()` excludes them
from token-stream equality; they remain useful as launcher-wrapper samples.

## `core/`

The three pieces that cannot be retrofitted later:

- **`value.ts`** — `PSValue`, where every value carries taint. Containers union
  their elements' taint, so a tainted value cannot hide inside an array or
  hashtable and re-emerge looking trustworthy.
- **`taint.ts`** — propagation. Taint is a set of gap ids rather than a
  boolean, so any unreliable output can name exactly what made it unreliable.
  Clean evaluation allocates nothing: `union` returns the shared `CLEAN` set,
  or reuses its single tainted input.
- **`gaps.ts`** — the ledger. Gaps deduplicate by kind and signature, so a
  member called in a loop is one record with a large blast radius rather than
  ten thousand rows. `GAP`, `STUB_BY_DESIGN` and `HARD_BLOCK` are never
  conflated; only `GAP` reaches the actionable queue.
- **`trace.ts`** — decoded layers and events. This is the Didier Stevens eval
  log: each `IEX` hands back a layer with its provenance.

Note that `propagate()` counts toward blast radius while `union()` does not.
Bookkeeping must not inflate the implementation queue's ranking.

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
