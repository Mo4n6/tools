# Husk

PowerShell deobfuscation and IOC extraction, fully browser-local.

Design spec: [`docs/husk-spec.md`](../../../docs/husk-spec.md).

## Status

Phases 0–3 complete and shipped as a tab in the tools shell at `#/husk`.
Paste a sample, get decoded layers, recorded host calls, IOCs and an honest
fidelity report.

The tokenizer agrees with real PowerShell on 100% of the oracle corpus.
Deobfuscation coverage:

| Corpus | Recovered |
|---|---|
| Single-transform (244) | **80.7%**, zero silent failures |
| Layered, 2 transforms (288) | **67.4%** |
| Layered, 3 transforms (576) | **41.7%** |
| Layered, all (864) | **50.2%** |

The single-transform number is the flattering one — it answers "can Husk undo
transform X". Real droppers stack transforms, so the layered corpus is the
honest measure. Target corpus is commodity IR — see
[spec section 9](../../../docs/husk-spec.md).

- `core/` — the taint-aware value model, gap ledger and execution trace.
- `corpus/` — generated ground truth. Test-only; never imported by the app.
- `analyze.ts` — the entry point: source in, layers + events + IOCs + gaps out.
- `HuskApp.tsx`, `useHusk.ts`, `husk.worker.ts` — the UI and its worker.
- `eval/` — the expression parser, constant folder and deobfuscation pipeline.
- `host/` — stubs for constructs recorded but never performed.
- `ioc/` — indicator extraction and defanging.
- `lexer/` — character classification, the token model, and the tokenizer.

## `corpus/`

Ground truth we did not author, so a fixture cannot encode the same
misunderstanding as the code it tests. Both files are generated and committed,
so tests run without PowerShell installed.

| File | Contents | Generator |
|---|---|---|
| `fixtures/invoke-obfuscation.json` | 244 (obfuscated, expected) pairs across 17 transforms | `scripts/husk/generate-corpus.ps1` |
| `fixtures/layered.json` | 864 fixtures stacking 2–3 transforms | `scripts/husk/generate-layered-corpus.ps1` |
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

## The tokenizer

`lexer/tokenizer.ts` covers the subset obfuscated commodity droppers emit, not
all of PowerShell. It never throws and never stalls: unknown input becomes an
`Unknown` token plus a diagnostic, and the scanner is guaranteed to advance, so
an anti-analysis sample cannot hang the worker.

Correctness is established by **differential testing against the real
PowerShell tokenizer**, not by reading the grammar. `__tests__/tokenizer.oracle.test.ts`
asserts agreement across all 264 lexable oracle cases, and the assertion is
exact — a regression names the diverging construct rather than moving a number.

### What the convergence loop cost

Agreement across successive fixes: 51.9% → 57.6% → 82.2% → 92.4% → 94.3% →
98.1% → 98.9% → **100%**. Every step was driven by a frequency-ranked
divergence report rather than a guess, which is the whole argument for building
the corpus before the code.

### Mode tracking

PowerShell's real tokenizer is told its mode by the parser: the same `-5` is a
negative number in expression mode and an argument in command mode. Husk has no
parser yet, so it infers mode. Three findings from the oracle that are easy to
get wrong:

- **A `[` is a type literal only when it does not follow a value.** `$ShellId[1]`
  indexes; `[char]34` does not. Inside a type literal, dots are part of the name
  and keywords stop being keywords, so `[type]` is the type named "type".
- **`)` restores the mode that was in effect when its `(` opened.**
  `(Get-Thing).Name` is member access, but `Set-Item (expr) -Param` keeps
  `-Param` a parameter. A blanket rule cannot satisfy both; the tokenizer keeps
  a mode stack.
- **A quote part-way through a command argument opens a quoted section, not a
  new string.** That is what makes the tail of a `powershell "..."` launcher
  one `Generic` token, spaces included.

## `eval/`

The pipeline runs two engines per layer:

- **Recipes** (`pipeline.ts`, `charArray.ts`) pattern-match whole-command
  launcher shapes at the text level: `-EncodedCommand`, Deflate/Gzip over
  base64, and the Ascii/Hex/Octal/Binary/BXOR character-array encoders. Their
  surrounding `ForEach-Object` pipelines need the phase 2 evaluator, but the
  transforms themselves are mechanical.
- **Expression folding** (`parser.ts`, `evaluator.ts`, `members.ts`) evaluates
  constant expressions through the taint-aware value model. This is what
  unwraps token and string obfuscation.

`canonicalize.ts` runs first with lossless spelling fixes — escape backticks,
braced variable names, quoted member names, and method-reference `.Invoke`.

Every member access, static call and cast routes through `members.ts`, which is
spec commitment 3: a sample cannot reach .NET by another spelling, because
there is no other path.

### Coverage

`__tests__/corpus.test.ts` asserts an overall floor plus per-transform floors,
so one family cannot quietly collapse while the total holds. It also asserts
the honesty contract directly: **every fixture Husk fails to recover must
record a gap naming why.** That test is what forced `recordResidue` to exist.

### Things the corpus corrected

- **PowerShell's `-split` operator is case-insensitive; `.split()` is not.** A
  chain declaring `-Split'A'` also splits on every lowercase `a`. Treating it
  as case-sensitive did not fail loudly — `parseInt` truncated at the missed
  delimiters and dropped characters out of the decoded script.
- **Escape rules are 5.1's, not 7's.** Windows PowerShell 5.1 has no `` `e ``
  escape, so decoding a 5.1-targeted sample with 6+ rules turns the `e` in a
  backtick-broken identifier into ESC and corrupts the name.
- **`&('Wri'+'te-Host') "x"` computes a command *name*, not a payload.**
  Treating the argument as the next layer silently discarded the call's own
  arguments.
- **Only a `(` touching its name is an argument list.** `Write-Host ('a'+'b')`
  has a space and folds; `.GetBytes("x")` does not and must keep its parens.
- **A payload can be *piped* into IEX, not just passed to it.**
  `'...'.Replace(...) | &'ieX'` sends its script in through the pipeline.
  Reading only invocation arguments missed it, and it alone blocked 29% of the
  layered corpus.
- **Scripts are statements, not one expression.** Parsing the whole source as a
  single expression made everything after the first statement invisible; adding
  statement splitting moved the Command family from 30% to 83%.

## `host/` and `ioc/`

`host/stubs.ts` recognises network, process, filesystem, registry,
persistence, assembly, WMI, evasion and timing constructs, records each as a
trace event, and files it as **`STUB_BY_DESIGN`** — never as a `GAP`. That
distinction is load-bearing: a stub is working as intended and must never
appear in the implementation queue.

`ioc/extract.ts` harvests indicators from **every layer reached**, not just the
final stage. This is what makes Husk useful well below full deobfuscation
coverage: a sample that only unwraps two of four layers still yields the
stage-2 URL, which is usually what the analyst came for. Indicators are
deduplicated to the earliest layer they appeared in and reported defanged
(`hxxp://evil[.]test`) so they can be pasted into a ticket safely.

## What real samples corrected

Four real Emotet droppers (from PSDecode's bundled test set) were run through
Husk. The samples are not committed; `__tests__/realShapes.test.ts` reproduces
the shapes with benign payloads. Three findings the synthetic corpus could not
produce, because Invoke-Obfuscation always emits a launcher:

- **A bare base64 blob is the most common real input.** Lifted out of a macro,
  a scheduled-task action or an EDR command-line field, the `-enc` is already
  stripped. Two of the four samples were exactly this, matched no recipe, and
  Husk reported a **false clean** — `reliable: true`, no gaps, no indicators.
  That is the single worst outcome the design admits. There is now a
  `bare-base64` recipe, and both samples unwrap four layers.
- **A run that matched nothing must say so** — but only when it did not
  *understand* the input, not when the input was simply an ordinary script.
  Conflating those either cries wolf on every benign script or hides a real
  failure. The tokenizer separates them: source it read without diagnostics or
  `Unknown` tokens is unremarkable; source it could not read is a gap.
- **Emotet packs fallback C2s as an `@`-separated list.** `@` is legal in a
  URL, so a greedy match swallowed the whole chain as one indicator. Splitting
  on `@` followed by a scheme recovers all five, and hostnames without a dot
  are now rejected as concatenation fragments.

## Security properties

Two are asserted by tests rather than assumed:

- **The payload is never handed to the JS engine.** No `eval`, no `Function`
  constructor. It is parsed and folded by a tree-walking interpreter and stays
  data throughout.
- **Analysis makes no network requests.** Stubbing `fetch` and `XMLHttpRequest`
  and asserting they are never called — including on a sample whose whole
  purpose is to download a stage.

Two are structural:

- **Worker isolation with step and wall-clock budgets**, so anti-analysis input
  cannot hang the tab. The parser also caps nesting depth at 200; a test with
  2000 nested parentheses found that recursive descent otherwise overflows the
  stack, which is a hang rather than an error.
- **One dispatch chokepoint** for every member access, static call and cast.

### CSP: not yet delivered

Spec commitment 5 calls for `connect-src 'none'`, which would make "this never
phones home" provable from the headers rather than promised. It is **not in
place**, because the CSP is document-wide and sibling tools in the shell need
network access (model downloads, URL ingestion). The route to it is the Dead
Letter precedent — a standalone page with its own policy — which needs a second
build entry. Until then the guarantee rests on the two tests above, which is
weaker: it proves the code does not reach for the network, not that the browser
would stop it.

## Tests

```sh
npx vitest run src/features/husk
```
