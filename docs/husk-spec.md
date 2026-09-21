# Husk: PowerShell Deobfuscation & IOC Extraction

**Status:** design spec, pre-implementation.
**Route (planned):** `#/husk` and `/tools/husk`

Husk is a static, fully browser-local tool for analysing malicious PowerShell.
Paste a script, get back its deobfuscated layers, an execution trace, and the
IOCs harvested along the way. Nothing leaves the browser.

The name is the thesis: it has the shape of a shell with no engine inside.

## 1) The core idea

Husk is modelled on Didier Stevens' patched SpiderMonkey, which is the standard
tool for malicious JavaScript in PDFs. That tool does not emulate Adobe Reader.
It logs the arguments of every `eval()` and `document.write()` call, so an
obfuscated script unpacks itself layer by layer and the analyst reads the layers
off disk.

Husk applies the same insight to PowerShell: **the computational half of the
language is implemented for real; every dangerous construct is a stub that logs
its arguments instead of performing the action.**

`Invoke-Expression` is our `eval`. Recursing into it is the whole trick.

### Why not run real PowerShell (Blazor / mono-wasm + SMA)

Considered and rejected. Four reasons, in order of weight:

1. **It does not raise the ceiling.** Two independent things limit coverage:
   *implementation fidelity* (does our evaluator know what a given .NET member
   does?) and *information availability* (does the key exist anywhere in the
   sample?). A real runtime only helps the first. The hard blocks below are all
   the second, and are untouched by it.
2. **Real execution fails dishonestly.** Given a sample keyed on
   `$env:USERDOMAIN`, real SMA returns the sandbox's empty value, derives a key
   from it, decrypts to garbage, and reports success. Our evaluator knows the
   value is unknowable, taints it, and says the output is unreliable. For a
   deobfuscator, honest failure beats fidelity.
3. **You must neuter it anyway, and the neutering is bypassable.** We do not
   want the page calling `DownloadString`. Stubbing inside a compiled .NET
   runtime means constrained runspaces and proxy functions — and a sample that
   calls `[Net.WebClient]::new().DownloadString()` directly through .NET walks
   straight past a proxied cmdlet. In our own tree-walker we own every member
   access; there is no path around the instrumentation.
4. **Cost.** `System.Management.Automation.dll` is ~7MB before the BCL and
   runtime, and is too reflection-heavy to trim safely. Realistically 40MB+ on
   cold load against ~200KB for a TypeScript interpreter. Runtime speed is not
   the issue — deobfuscating a 50KB script is milliseconds under any engine —
   the download and init are.

Unverified but noted: SMA compiles scripts through the DLR to
`Expression.Compile()`, i.e. Reflection.Emit, which works in mono's interpreter
mode but not AOT. Plausible on .NET 8+; no known working build.

**Falsifier for this decision:** a working SMA-on-WASM build under ~15MB booting
in under 3 seconds. That would be worth revisiting for fidelity — but the
ceiling would still be set by information availability, not by us.

## 2) The honest ceiling

100% deobfuscation is not achievable, and targeting it makes the tool less
trustworthy rather than more.

### Information-theoretic blocks (no architecture fixes these)

- **Environmental keying.** Payload decrypts with a key derived from
  `$env:COMPUTERNAME`, the AD domain, volume serial, `MachineGuid`, process
  list, or the current date. If the key is `SHA256($env:USERDOMAIN)`, the
  information is not in the sample. Mitigated — not solved — by letting the
  analyst supply the environment (§5).
- **Remote staging.** `IEX (New-Object Net.WebClient).DownloadString(...)`. The
  next stage lives on a server. We log the URL (which is the IOC the analyst
  wanted) but cannot deobfuscate bytes we do not have. If the C2 is dead, that
  stage is gone for everyone — for us, for real PowerShell, for a full VM
  detonation. This alone caps any real corpus below 100% permanently.
- **Embedded PE / shellcode.** `[Reflection.Assembly]::Load(...)` or
  VirtualAlloc-plus-delegate shellcode. We do not execute IL or x86. Correct
  behaviour is detect, dump, extract strings, hand off to a PE tool.

### The fixable-but-never-finished block

The .NET API surface. Every new sample finds an unimplemented member, and
obfuscators reach for obscure members *specifically* because tools do not
implement them. This is permanent incremental work, driven by §6.

### Estimated coverage (to be replaced by corpus numbers)

| Class | Estimate |
|---|---|
| Pure encoding/string obfuscation (base64, gzip, reverse, `-f`, char arrays, concat, backticks, `${}`, splatting, IEX chains) | ~99% |
| Launcher/compress/encoding variants + AMSI-bypass preambles | ~95% |
| Crypto with the key embedded in the script | ~90% |
| Environmentally keyed | 0% cold; ~60–75% with supplied environment + bounded brute-force |
| Remote-staged | 0% for the unseen stage; 100% for the IOC |
| Blended over a realistic IR corpus | ~90% fully resolved, ~8% partial with flags, ~2% hard-blocked |

**These are priors, not results.** Replace them with corpus numbers as soon as
§6 exists.

### The coverage trap

Coverage is not `P(member implemented)`. It is `P(every member in this script is
implemented)` — a product. A script touching 20 distinct members at 97% each
yields `0.97^20 ~= 54%` of scripts unwrapping *fully*. The tail punishes far
harder than a frequency histogram suggests.

This is why **graceful degradation is the highest-leverage decision in the
design**. An unimplemented member must never abort the run: taint the value,
record the gap, keep evaluating. A script with one unknown member still yields
the other nineteen members' worth of decoded layers and every IOC along the way.
Same interpreter, different failure handling, 54% -> ~95% *usefully* unwrapped.

### Target the corpus, not a percentage

"Unwraps 412 of 450 variants, here are the 38 failures and why" is defensible,
improvable and publishable. "95%" is a vibe that invites arguing rather than
fixing. The project has no percentage goal.

## 3) Non-negotiable commitments

These five cannot be retrofitted. Everything else is refactorable.

1. **Taint lives in the value model**, from the first line of code. Retrofitting
   it means rewriting the evaluator.
2. **Evaluation never aborts.** Unknown member, parse failure, unsupported
   syntax — record and continue. See §2, the coverage trap.
3. **A single chokepoint for all member access and command dispatch.** Every
   property read, method call and cmdlet invocation routes through one function.
   This is what makes instrumentation free and bypass impossible.
4. **Worker isolation with step and wall-clock budgets**, from the start.
   Anti-analysis loops will otherwise hang the tab.
5. **`connect-src 'none'` in the CSP, from the first commit.** Analysts are
   pasting live malware. "This never phones home" must be provable from the
   headers, not promised in a README.

### And one prohibition

**The payload is data, forever.** Never `eval`, `new Function`, `innerHTML`, or
any other construct that hands payload-derived strings to the browser's own JS
engine. Tree-walking interpreter only. This is the property that makes the tool
safe to paste malware into, and it is load-bearing for commitment 5.

## 4) The taint model

Every value carries provenance. A value is tainted when it derives from
something we could not faithfully compute: an unimplemented member, a
by-design stub's return, or an unknown environment value used in key derivation.

Taint propagates through every operation. Any output derived from tainted data
is flagged: *"incomplete — depends on unimplemented `[X]::Y` at layer 3, line
N."*

Two things fall out of this for free:

- **Gap prioritisation.** Blast radius (how many downstream values a gap
  tainted, and whether the final output depends on it) ranks the implementation
  queue mechanically. See §7.
- **Environment triage.** If an env value flows into a crypto or key-derivation
  sink, demand a real value from the analyst. If it flows into string concat,
  synthesise a plausible one and move on. The taint graph tells us which is
  which without guessing.

## 5) The emulated environment

Environment is a first-class, analyst-editable input — not hardcoded.

**Synthesise freely for incidental use.** Most environment access in real
samples builds a drop path or a mutex name: `$env:TEMP`, `$env:APPDATA`, `$PID`.
Any plausible value produces structurally correct output ("drops to
`%APPDATA%\svc.exe`").

**Never synthesise for key derivation.** A random domain name decrypts to
garbage — a confidently wrong answer, which is the failure mode this whole
design exists to avoid. Demand the value, or mark it a hard block.

**Bounded brute-force is legitimate where the keyspace is small** and a
plausibility oracle exists: date-keyed (365 candidates), single-byte XOR (256),
PID ranges, short numerics. Score candidates on printable ratio, entropy drop,
PowerShell keyword hits, MZ header. Never extend this to unbounded spaces —
domain names, MachineGuids and volume serials are not brute-forceable.

**Remote stages can be supplied manually.** Let the analyst paste a fetched
stage, or map URL -> uploaded file, and continue the trace. The tool itself
never fetches.

## 6) Corpus and differential testing

**Build the corpus before any interpreter code.** Nothing is measurable without
it, and it decides the implementation order for everything downstream.

- `Invoke-Obfuscation` mechanically generates hundreds of variants of a single
  known payload across every token/string/launcher combination. That is ground
  truth for free.
- Commit fixtures as (input, expected final stage, expected IOCs).
- Real samples with known outcomes go in alongside, hashes only where the sample
  itself cannot be committed.

### Lexer oracle

The lexer is the single highest-variance component of the project. De-risk it
with differential testing:
`[System.Management.Automation.Language.Parser]::ParseInput()` produces a
ground-truth token stream and AST for any input. Generate (input -> tokens)
pairs with `pwsh` offline, commit them as fixtures, and test our lexer against
truth rather than judgment.

This converts the riskiest estimate in the project into a mechanical convergence
problem.

### Reference material

PowerShell Core is MIT licensed: `github.com/PowerShell/PowerShell`. The
relevant sources are under `src/System.Management.Automation/engine/parser/` —
`tokenizer.cs` (the authoritative expression-vs-argument mode machine),
`Parser.cs`, `ast.cs`, `CharTraits.cs`.

Also: the **PowerShell Language Specification 3.0**, published free by Microsoft
under the Community Promise, with the full grammar in BNF. Dated 2012; nothing
relevant to us has changed.

**Licensing:** MIT permits porting, but a port is a derivative work and carries
the attribution requirement — record it under `docs/licenses/` and
`src/licenses/` as this repo already does for other components. A port is not a
dependency: the result is owned, vendored and auditable, with no runtime supply
chain. Where the specification is unambiguous, prefer building from it; consult
the source for the edge cases where real PowerShell deviates from its own spec.

**Scope note:** we need the subset obfuscators emit. `tokenizer.cs` also handles
comment-based help, DSC, workflow keywords and class syntax — all droppable. A
selective port is a fraction of the file.

## 7) Gap reporting

The feedback loop is the product. A sample Husk cannot fully handle must produce
everything needed to fix that, without needing the sample again.

### Three categories, never conflated

| Kind | Meaning | Action |
|---|---|---|
| `GAP` | Unimplemented member, cmdlet, or syntax | Implement it |
| `STUB_BY_DESIGN` | Network, process creation, filesystem write | None — working as intended |
| `HARD_BLOCK` | Environmental keying, dead C2, embedded PE | None — see §2 |

Conflating these makes the report noise.

### Gap record fields

- **Signature** — `[System.Security.Cryptography.Aes]::Create()`, with observed
  argument types and shapes.
- **Provenance** — layer index plus the decode chain that produced it. The
  failure is usually in decoded layer 3; a line number against the pasted input
  is useless.
- **Blast radius** — count of downstream values tainted, and whether the final
  output depends on this gap.
- **Sample SHA256** — correlates runs without sharing the sample.

**Gaps sort by blast radius, descending.** The top row is "implement this next."

### Output paths

1. **UI panel** — grouped by kind, sorted by impact.
2. **Copy-as-issue** — markdown block ready for a GitHub issue, with redaction
   applied. Argument values can contain payload: fine locally, not fine in a
   public issue.
3. **Generated stub skeleton** — emit the TypeScript registration for the
   missing member (name, arity, observed arg types) so implementing a gap is
   filling in a body, not writing plumbing.
4. **JSON export for the corpus runner** — the highest-leverage output. Batch
   across the corpus, aggregate, and get *"these 12 unimplemented members block
   300 samples."* Implement those 12, re-run, repeat.

Because of §3.5 the tool cannot phone home with telemetry, and that constraint
stands. The loop is manual by necessity, so make the copy path frictionless.

### Parse errors

Never emit a bare "syntax error." Include surrounding source, the token stream
up to the failure point, and the lexer mode state. Otherwise every lexer bug
costs a full re-derivation.

## 8) Build phases

Sequenced so the tool is useful before it is finished. The failure mode for this
project is a beautiful parser and no shipped tool.

| Phase | Scope | LOC | Outcome |
|---|---|---|---|
| 0 | Taint-aware value model, fidelity recorder, corpus runner | ~950 | Nothing ships; everything downstream becomes measurable |
| 1 | Lexer + decoder pipeline (no parser yet) | ~2,000 | ~55–65% of a commodity corpus fully unwrapped |
| 2 | Parser + tree-walk evaluator + member dispatch table | ~4,500 | ~85–90% |
| 3 | Host stubs, IOC extraction, environment panel, worker, UI | ~2,750 | The actual tool |
| 4 | Crypto, bounded brute-force + oracle, long-tail members | ~1,000+ | ~92–93%, ongoing |

Plus ~2–3k LOC of tests. **~14–16k total for v1.**

### Phase 1 detail

`-EncodedCommand`/`-enc`/`-e` -> UTF-16LE. Gzip/Deflate via native
`DecompressionStream`. Backtick stripping, case normalisation, `{1}{0}`-`f`
format, concat, `-join`, `[char]` arrays, string reversal. IEX-chain recursion.
Plus a pattern recogniser for AMSI-bypass preambles, so the reflection soup at
the top of half the corpus is annotated and skipped rather than choking the
trace.

All of this is achievable with a lexer and a limited evaluator, before any real
parser exists.

### Zero runtime dependencies

Everything needed is native: `DecompressionStream` (gzip/deflate), `atob`
(base64), `TextDecoder('utf-16le')`, WebCrypto (AES, hashing). The odd
cipher mode and RC4 are a few hundred lines hand-rolled. Nothing third-party
enters the runtime.

### Sequencing rules

- **Phases 1 and 3 are independent of phase 2.** Wired together they give a
  working IOC extractor that handles commodity droppers end to end and honestly
  flags what it cannot reach. Recommended v1.
- **Build phase 1 as a vertical slice, not a layer** — paste box to decoded
  layers to IOC list to gap report, shipped into the tools shell, ugly UI and
  all. Every later phase then increments something live.
- **Let corpus failures drive phase 2 ordering.** Do not build the parser
  top-down from the grammar; that spends days on language surface obfuscators
  never emit.
- **Hard rule: every line of interpreter must be justified by a corpus
  failure.** This is what keeps the project finite.

## 9) Open questions

- Target corpus: commodity IR (malspam droppers, coinminers) or red-team/APT
  tradecraft? The first is mostly encoding layers and lands near the top of the
  §2 estimates. The second leans harder on environmental keying and reflection,
  and the honest ceiling is meaningfully lower.
- Ship threshold: phases 1+3 early, or hold for phase 2 depth? Spec assumes
  early.
- Whether the lexer is a selective port of `tokenizer.cs` or built from the
  3.0 specification with the source consulted for edge cases.

## 10) Prior art

`PSDecode`, `PowerDecode`, `Invoke-Deobfuscation` — all require a real
PowerShell host, and all use cmdlet-override architectures with the bypass
problem described in §1.3. CyberChef covers generic encoding recipes but has no
PowerShell semantics. Nothing good is browser-static; the niche is open.
