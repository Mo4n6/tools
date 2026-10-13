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

## Running against real samples

The committed corpus proves specific transforms are undone. A local corpus
answers a different question: over real, messy, unselected input, does Husk
crash, hang, or report a clean result on a sample it never understood?

```sh
npm run husk:local -- /path/to/samples --limit 300
```

It reports crashes, near-budget runs, unwrap and indicator rates, the ranked
unimplemented constructs, and — the number that matters — **false cleans**. It
exits non-zero on any crash or false clean, so it can gate a release.

**Samples are never committed here.** Point it at a directory outside the tree.
Sources worth knowing, roughly in order of usefulness for this tool, since a
deobfuscator mostly needs text rather than binaries:

- **PSDecode** bundles four real Emotet droppers in a password-protected zip
  (`infected`). Small, real, and what found the three faults above.
- **Fa2y/Malicious-PowerShell-Dataset** — note the composition: the headline
  `malicious_samples/` is mostly offensive-security tooling scraped from GitHub
  (Empire, PowerSploit, nishang), which is red-team code rather than commodity
  malspam. The `bazaar_out/`, `triage_out/` and `hybrid_analysis_out/`
  directories are the sandbox-sourced ones and are far closer to the target.
- **SigmaHQ/sigma** and **Atomic Red Team** carry real obfuscated command lines
  as plain text, with no binary handling at all.
- **malware-traffic-analysis.net** publishes real malspam with writeups, so you
  get ground truth for what each sample does.
- **MalwareBazaar**, **MalShare** and **Triage** for volume, via free API keys.

### What the last run over it found

300 samples from `bazaar_out` and `hybrid_analysis_out`, plus the four Emotet
droppers: no crashes, nothing near the time budget, **94% yielded indicators**,
121 of 300 unwrapped a layer, and **no sample that Husk was blind to**. Getting
to that reading took four fixes and two corrections to my own first reading of
the numbers, which are both recorded below because the corrections are the more
useful half.

The one sample the harness still flags as a false clean is
`Write-Host -ForegroundColor Red 'BAd Boys Test'` followed by `Pause` - 59
bytes, genuinely benign, somebody's test file sitting in a malware feed. Husk
found nothing and said it was confident, which is correct. The flag is a
limitation of the metric, which cannot tell "found nothing because the sample is
harmless" from "found nothing because I am blind"; on a malware corpus that
heuristic is usually right, and here it is not. Worth knowing that the previous
reading of zero false cleans was two errors cancelling: the stray UTF-8 BOM was
raising a gap that marked this benign file unreliable, so stripping the BOM is
what exposed it.

**UTF-16 samples were read as mojibake - by the harness, not the tool.**
Seven of the 300 are UTF-16LE. `run-local-corpus.mjs` read every file as UTF-8,
which puts a NUL between every character; that tokenises to nothing, so all
seven scored as "found nothing" for a reason that had no bearing on Husk. One of
them was a false clean. Decoding them properly turns six of the seven from zero
indicators into real ones - 59 indicators that the measurement could not see,
and one sample that goes from 1 layer to 3 with 21 events. The harness now
sniffs the BOM, and the no-BOM case too, since some droppers omit it. The
browser is unaffected: Husk takes pasted text, which the clipboard has already
decoded, so the sniffing belongs in the harness and nowhere else. UTF-8 BOMs
were checked at the same time and are harmless - a leading U+FEFF changes
nothing - but it is stripped now so layer 0 matches the file.

**A TLD gap that was real but not what it looked like.** `.stream` was missing
from the domain rule's TLD set, along with the rest of the registries with the
worst abuse rates. The set is curated rather than complete, deliberately - bare
hostnames are noisy - so these were added, leaving out the TLDs that collide
with file extensions (`.zip`, `.mov`, `.app`), since `payload.zip` reading as a
domain is a fabricated indicator, which is worse than a missing one. What this
did *not* do is fix the false clean originally attributed to it: that sample is
one of the seven UTF-16 files, and the `"anyconnect.stream","bigip.stream"`
line first quoted as evidence came from a `tr -d '\0'` in the inspection
pipeline, which made mojibake look like clean ASCII. The domains are genuinely
in the file; Husk never saw them, for the encoding reason above. Re-measuring
showed no indicator count anywhere changed when the TLDs were added, which is
how the misattribution surfaced. The addition stands on its own merits and is
covered by tests; it earned no part of the false-clean fix.

**Reliability was vacuous when nothing was produced.** `isReliable` reads layer
and event taint, so it answers "is what I produced trustworthy". With nothing
produced that is vacuously true: a reflective loader whose every
`GetAssemblies()` was recorded as a gap still reported as fully resolved,
because there was no output for the gap's taint to reach. The pipeline now
taints the deepest layer when the ledger is non-empty and the run produced
neither a layer nor an event.

**Eighteen of twenty comparison operators were unimplemented.** The tokenizer
knows all twenty; the evaluator handled `-eq` and `-ceq` only, so `-ine` alone
accounted for 11 gap records in 300 files. Implemented the equality, ordering
and membership families, and the range operator `..` (14 records), which
obfuscators use to build char arrays and to reverse strings. `-match` and
`-like` are still gaps on purpose: both would compile a pattern out of
sample-supplied text, and a deobfuscator its input can make backtrack has
handed the sample a hang.

**The range operator was inflating layer and event counts.** Implementing `..`
moved "unwrapped a layer" from 120 of 300 to 119, which looked like a
regression and was the opposite. The one sample that moved contains
`-join ((65..90) + (97..122) | Get-Random -Count 9 | % {[char]$_})`, a random
identifier generator. With `..` unimplemented the constant-folder replaced that
59-character expression with the literal `'0'` - a fabricated value - and the
56-byte difference counted as a new layer. It then did it again. The result was
three "deobfuscation layers" that were the same script with a wrong
substitution, and its nine events counted three times, 27. With `..`
implemented there is one layer and nine events, and the nine are byte-identical
to what layer 0 reported before, at the same offsets. A second sample shed a
phantom layer the same way, 36 events to 24. So the honest reading of the
counter is that it was over-reporting, and one sample's worth of that
over-reporting is now gone.

**Constant folding could invent a value and call it clean.** The folder
refuses a parenthesised group whose evaluation hit a gap, on the grounds that
folding it would be a guess. It checked this by comparing `trace.gaps.size`
before and after - but the ledger deduplicates by signature, so that number
only moves for a gap the run has not seen before. A *repeat* was invisible.
`@(1..16)` earlier in a script put `operator DotDot` in the ledger; the group
`((65..90) + (97..122) | Get-Random -Count 9 | % {[char]$_})` then evaluated
with the check satisfied, folded to whatever the unresolved operand coerced to
- the literal `'0'` - and shipped as a layer marked CLEAN. Two lines are enough
to show the worst of it:

    $a = (1 -match 'x')
    $b = ('p' + (2 -match 'y'))

Without the first line the guard holds, nothing folds, and the run reports
unreliable. With it, `$b = 'p'` becomes a "deobfuscated" layer, the `-match`
that decides `$b` is gone, and because the layer is CLEAN the whole run reports
**reliable**. The fix tests the evaluated value's own taint, which carries the
gap ids it was derived from and cannot be deduplicated away.

Measured over the same 300: nine samples stopped producing a layer, 121 to 112.
Indicator counts are identical on 31 of the 32 samples whose result changed,
two samples went reliable to unreliable, none went the other way. The one
indicator change is the fix working: a sample had been reporting
`HKeY_curRent_USeR\SofTWARe\clAsSes\\shELL\opEN\cOmmaNd`, where the doubled
separator is the hole left by a computed ProgID folded to an empty string. That
path is never written. It now reports `HKeY_curRent_USeR\SofTWARe\clAsSes\`,
truncated where resolution stopped, and flags the run unreliable - a lead that
says where to look instead of a key that does not exist.

**`-and` and `-or` were unimplemented while `-band` and `-bor` were.** So
`$a -band $b` folded and `$a -and $b` was a gap, 14 records across 300 files.
Implemented with `-xor`, using PowerShell truthiness rather than JavaScript's -
`'0'` is a non-empty string and therefore true, and a one-element array takes
its element's truthiness. Every expected value was taken from `pwsh 7.6.6`
rather than from the documentation: 15 of 16 cases match it exactly. The
sixteenth, `@() -or 0`, exposed something unrelated - the parser does not handle
the empty array literal at all, and records `token RParen`. Bare `@()` and
`@() -eq 0` fail the same way, so it predates this work; it is honest about it,
and still uncovered.

These two differ from the operators above in that PowerShell short-circuits
`-and` and `-or` and this evaluator does not: both operands are evaluated before
the operator is applied, so a gap in the dead branch still taints the result.
That is the conservative direction, and this evaluator folds expressions rather
than running them, so there are no skipped side effects to get wrong.

**`New-Object` was one gap signature standing in for about forty types.** It
appears in 141 of the 300 samples, 541 times. The parser rejected it outright
as `command 'New-Object'`, consuming the command token and not its arguments,
and a residue scan added a bare `New-Object` marker for any layer mentioning
it. So the single most common unmodelled construct in real droppers ranked as
one undifferentiated lump that said nothing about which type to build next.

It now parses - `-TypeName`, `-ArgumentList`, a parenthesised or bare positional
argument list, and the `byte[]` shape the tokenizer splits into three tokens -
and constructs a value for the types Husk can represent: the .NET encoder
classes, mapped onto the same objects `[Text.Encoding]::X` already yields so
the existing `GetString`/`GetBytes` dispatch serves both spellings;
`New-Object byte[] N` as a zero-filled array under the same cap the range
operator has, since the size comes from the sample; and the list types as
arrays. Everything else is a gap **named with its normalised type**, so
`System.Net.WebClient`, `Net.WebClient` and the `Net.Webclient` a sample
actually wrote rank as one entry rather than three. That turns the lump into:

| | |
|---|---|
| `New-Object net.webclient` | 28x |
| `New-Object reflection.assemblyname` | 19x |
| `New-Object io.memorystream` | 14x |
| `New-Object byte[]` | 13x |
| `New-Object` (no type readable) | 7x |

WebClient, TcpClient and the stream types are deliberately **not** modelled. A
deobfuscator cannot fetch a URL or run a stream, so an object whose
`DownloadString` returned *something* would be inventing a value - the fault
fixed directly above. A named gap is the honest answer and still carries the
type.

Worth being straight about the result: this moved no number on the 300 samples.
Indicators stayed at 282, layers at 112. The constructs it resolves sit behind
other gaps in these particular samples - unresolved `IEX` arguments, reflection,
string interpolation - so the capability is tested and ready rather than
already paying off. What it did deliver is the ranking above, which is what
says where to aim next, and that is the lump's real cost: it had been hiding
`net.webclient` at 28x behind a number that looked like one problem.

Two pre-existing faults turned up while testing it, both left alone. `IEX
(group).Member()` silently drops the member chain, because PowerShell lexes
command-argument position differently from expression position and the
tokenizer reproduces that faithfully - it agrees with real PowerShell on 100%
of the oracle corpus, so this is a parser-mode gap, not a lexer bug. `IEX
('a' + 'b').ToUpper()` loses `.ToUpper()` the same way. And a variable holding
a constructed object does not survive to the next statement. Both predate this
work and neither is specific to `New-Object`.

**A fold could take the value of a prefix.** `parseExpression` stops where it
stops and reports how many tokens it left behind, and two callers ignored that.
The constant folder would parse a group's inner text, get a value for the first
few tokens, and fold the whole group to it. For `('a' + 'b' | %{ $_ })` the
prefix `'a' + 'b'` evaluates perfectly cleanly to `ab`, so no taint check can
catch this - the answer is not a guess, it is the wrong expression. The
assignment collector had the same hole. Both now refuse a partial parse. One
fabricated layer goes away on the 300 samples, 112 to 111, with indicators
unchanged.

This was the mechanism behind the `'0'` fold recorded above, which I could not
reproduce in a minimal case at the time: the group was not resolving to a wrong
value, it was resolving a *prefix* of itself.

Tried and reverted in the same sitting: making assigned variables visible to
the folds. `collectVariables` already exists and walks every assignment, but it
is called only from the alias collector, which returns early unless the script
defines an alias - so the folds each built an empty context and a `$name` the
script had plainly assigned read as a gap. Threading it through gained three
real layers and two indicators, and also produced two fabricated layers out of
the four it gained: one sample emitted 59 KB of whitespace as a decoded stage
and reported reliable; another emitted a run of binary digits, joined from the
literals of a `%{...}` it had not applied, and extracted a junk indicator from
them. Both were marked clean. The layer-emission paths mark output CLEAN on the
assumption that what fed them was unresolved, and that assumption gets weaker
the more gets resolved - so threading needs a check that a produced layer is
plausibly a script at all before it is worth having. The guards above are the
part that stands on its own, and they are kept.

The assignment collector's own two guards have no measured effect today, which
is worth stating plainly rather than counting them as fixes: with the threading
reverted, a stored variable only resolves an alias target, where a prefix
usually still spells the right name. Isolating them on the 300 gives 112, the
same as before. They are the invariant the threading will need, not a change to
today's output.

Worth noting what did **not** move: coverage over the generated corpus is
unchanged at 80.7% / 50.2%. Invoke-Obfuscation emits none of these constructs,
so no amount of that corpus could have found them. That is the argument for
keeping a local corpus in the loop rather than trusting the generated one - and
for distrusting a headline counter until a single sample has been read by hand,
since two of the four findings here were misread the first time.

### The engine runs by default

The engine is the default backend when one is being served; the tree-walker is
the other option in the picker rather than the starting point. Two things had to
change for that to be honest.

The intro said Husk "emulates it rather than running it", which stops being true
the moment the engine is the default. It now says what actually happens: a real
PowerShell build compiled to WebAssembly, sandboxed in the tab, with the
filesystem, registry and network as stand-ins.

And the worker was handing the engine whatever the analyst pasted. That is very
often a command line rather than a script - `powershell -nop -w hidden -enc
<base64>`, which is **36 of the 300** real samples and the product's own built-in
example. Run as PowerShell, `powershell` is not a command, so nothing executed
and the analysis came back empty. The worker now runs
`parseLauncher(source).script`, the same unwrapping the tree-walker has always
had; the original string is still what the report reads the launcher's switches
back out of. The shipped example went from a `'powershell' is not recognized`
error to three indicators and two events on the first click.

### Sleeping, and the loop behind it

A sample that ends `for (;;){ Start-Sleep 60 }` - and real ones do - used to
defeat the engine outright. `Start-Sleep` was aliased but not proxied, so the
run really slept, burned the whole wall-clock budget, and was killed by the
client's 30s hard timeout. The analyst got **nothing**: no calls, no ops, no
partial evidence.

Sleeping here waits for nothing. There is no clock the sample is synchronising
with and nothing arrives while it waits. The proxy records the duration and
returns, because the duration is evidence in its own right - a long sleep ahead
of the payload is a sandbox-evasion tell - and `timing.sleep` was already in the
op vocabulary with nothing emitting it.

That does not stop the loop, it just makes it spin, which is the point: the run
now reaches the engine's **own** budget and stops cleanly with partial evidence
instead of being killed from outside with none.

| | before | after |
|---|---|---|
| outcome | killed at the 30s hard timeout | `husk: time budget exhausted after 10000 ms` |
| host calls | **0** | **4,096** |
| ops seen | none | `assembly.define-type`, `assembly.pinvoke`, `timing.sleep` |

The spinning loop then exposed the next thing: it recorded 14,803 calls, and
nothing capped them. A sample decides how many records it makes, so without a
cap it decides how much memory the host uses - and a loop's ten-thousandth
identical record says nothing its first did not. The ledger now stops at 4,096
and reports how many it discarded (12,413 on that run), because a call list
silently cut short reads like a sample that did less than it did.

### The engine over the same samples

The numbers above are the tree-walker. `scripts/husk/engine/corpus.mjs` is the
same exercise for the wasm engine, which *executes* the sample where the
tree-walker only reads it, so the two fail in unrelated ways and the comparison
is the point. Network blocked, filesystem, registry and process APIs proxied.

The measure that matters is whether the pipeline **ran to the end**, which is not
the same question as whether the sample raised an error: `Start-Process` failing
is non-terminating, the script carries on, and the analysis is whole. Counting
those as failures is what produced the "48% error rate" recorded in an earlier
version of this file, and it was wrong.

Over the 300, with the launcher unwrapped the way the worker does it:

| | |
|---|---|
| ran to the end | **221 (73.7%)** |
| host calls recorded | **198 (66.0%)** |
| files dropped | 62 (20.7%) |
| cut short | 79 (26.3%) |

Measured both ways, which is the clearest evidence the unwrapping was worth
doing: feeding the raw source instead gives 214 run to the end and host calls on
only 165. Unwrapping the launcher is a third more samples whose behaviour the
engine actually observes, and it drops "not parseable as PowerShell" from 26 to
15.

Of the 79 that did not finish:

| | |
|---|---|
| budget stop at 10s | 21x |
| sample is not parseable as PowerShell | 15x |
| browser-wasm operation unsupported | 11x |
| cmdlet not in the bundle | 6x |
| sample terminated the runtime | 1x |

So the engine's own gaps account for **40 of 300 (13.3%)**, and the single
biggest one is the time budget rather than a missing capability. 37 of the
cut-short runs still recorded host calls before stopping, so even a cut-short
run is usually evidence.

Which chokepoint saw anything, across the corpus: cmdlet 99, binder 91, proxy
77, provider 8. That spread is the engine's whole argument - four independent
places a call can be caught, three of them seeing real traffic on a third of the
corpus.

Setting the two backends side by side, counting a sample as covered when a
backend produced either indicators/events or host calls/dropped files:

| | |
|---|---|
| both backends | 161 |
| tree-walker only | 125 |
| **engine only** | **5** |
| neither | 7 |

The engine uniquely covers five samples out of 298 - and two of those five are
the samples where the tree-walker's fold guard correctly refuses to invent a
value. That is the engine earning its place exactly where the other backend is
honest about not knowing, which is the argument for keeping both. It is not an
argument that the engine carries the analysis: on this corpus the tree-walker
does, by a wide margin, which is worth knowing now that the engine is what runs
first.

The seven neither backend gets anything from: one is the benign `Write-Host`
test file (correct on both), one is written with literal spaces between every
character so neither can parse it, four are parse failures on what look like
truncated fragments, and one terminates the wasm runtime outright by calling
`exit`.

That last one is worth knowing about. A sample that exits the runtime leaves the
runspace dead, and because the runspace is single-threaded every later script
then fails with "a pipeline is already running". The product handles this -
`EngineClient` rejects on an error response, and `useHusk` discards the client
and builds a fresh one, with a comment saying why - so this is a harness hazard
rather than a product bug. It cost 206 invalid rows before the harness was
taught the same discipline, which is why `corpus.mjs` probes the engine's health
after every failure.

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
