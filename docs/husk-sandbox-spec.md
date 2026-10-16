# Husk: the virtual host

**Status:** design spec, pre-implementation.
**Supersedes:** nothing. Extends [`husk-spec.md`](husk-spec.md), which stays
authoritative for the taint model, the gap ledger and the five commitments.

`husk-spec.md` describes a PowerShell deobfuscator. This describes the layer
underneath it: a **recording fake of an operating system**, against which any
scripting front-end can run, and which logs every call instead of performing it.

The goal is not to build an OS. It is to be faithful enough that a sample
behaves normally while every effect it tries to have is captured as evidence.

---

## 1) The correction this document starts from

`husk-spec.md` §1 rejected running real PowerShell (SMA on mono-wasm) for four
reasons. In conversation I recently argued the opposite — that a real engine was
the high-leverage move, because it would take deobfuscation fidelity from a
measured ~80% to ~100% for free.

That argument was right about fidelity and wrong about this tool. Reason 3 of
the original rejection is decisive once the objective is capturing host calls:

> You must neuter it anyway, and the neutering is bypassable. A sample that
> calls `[Net.WebClient]::new().DownloadString()` directly through .NET walks
> straight past a proxied cmdlet. In our own tree-walker we own every member
> access; there is no path around the instrumentation.

A real runtime gives perfect fidelity and **partial capture**. You observe the
calls you remembered to shim and silently miss the rest. For a deobfuscator that
is a fair trade. For a sandbox whose entire output is "here is what it tried to
do", it is the wrong failure: a missed syscall is invisible, whereas a missing
member is a recorded gap. Silent incompleteness is the one thing this project
has consistently refused to ship.

So the tree-walker stays. It is not a limitation to be engineered away; it is
the instrumentation surface.

### Real PowerShell becomes the oracle, not the engine

The fidelity argument still stands on its own, and there is a way to collect it
without giving up capture. The tokenizer went from 51.9% to 100% agreement by
being diffed against real `[Parser]::ParseInput()` rather than by reading the
grammar. Apply the same method one level up:

- Run a fixture through Husk and through real PowerShell side by side.
- Diff the final deobfuscated text.
- Every divergence is a concrete, reproducible fidelity gap with a known
  expected value.

That converts "implement .NET members until samples stop breaking" — which
`husk-spec.md` §2 correctly calls permanent incremental work — into a finite,
ranked worklist. Real PowerShell as oracle is the realistic route to ~100%
deobfuscation. Real PowerShell as engine is not, because of what it costs in
capture.

Where the oracle runs is an open question (§10). It does not need to be in the
browser, which removes the 40MB cold-load objection entirely.

---

## 2) The defect this starts by fixing

Commitment 3 of `husk-spec.md` says a single dispatch chokepoint is "what makes
instrumentation free and bypass impossible". The code does not currently do
that.

`host/stubs.ts` exports `scanAllLayers`, called from `analyze.ts`. It matches
**regular expressions against decoded layer text**. `eval/members.ts` — the
actual chokepoint — records gaps but emits no host events at all.

The consequence is directly contrary to the tool's purpose:

```powershell
$m = 'Download' + 'String'
$wc.$m($url)          # no network event: that literal is in no layer
```

Textual scanning is defeated by exactly the obfuscation the tool exists to
defeat. It also cannot report arguments it did not resolve, so a captured URL is
only captured when it was already in plaintext.

**Work item 1, before anything else in this document: move host capture from
`scanAllLayers` to the dispatch chokepoint.** By the time `members.ts` resolves
`$wc.$m(...)`, the method name is a computed string and the argument is an
evaluated value with taint attached. That is the only place where capture is
both complete and accurate.

Keep the regex scanner afterwards, demoted: it still catches indicators in inert
text that never executes (a URL in a comment, a path in a string the script
never uses), which is genuinely useful and which the chokepoint cannot see.
Label the two sources differently in the output — *observed call* versus *text
match* — because an analyst treats them differently.

---

## 3) The virtual host

One object, passed to every front-end, holding four fakes and an event log.

```ts
export interface VirtualHost {
  readonly fs: VirtualFileSystem;
  readonly registry: VirtualRegistry;
  readonly processes: VirtualProcessTable;
  readonly net: VirtualNetwork;
  readonly env: VirtualEnvironment;   // already exists as eval/hostConstants.ts
  record(call: HostCall): HostResult;
}
```

Every fake is **stateful and readable back**. This is the part a regex scanner
cannot do and it is where the analytic value is:

```powershell
$p = "$env:TEMP\a.ps1"
[IO.File]::WriteAllText($p, $stage2)
powershell -File $p
```

A recording fake answers the read, so the second stage is recovered and the
chain is reconstructed. A stub that only logs returns nothing and the chain
dies. Statefulness is the difference between a log and a sandbox.

### Event schema

`core/trace.ts` already has `TraceEvent` with a `category` of `network`,
`process`, `filesystem`, `registry`, `assembly`. The schema below is that type
made precise, not a replacement. Migration is additive.

```ts
export interface HostCall {
  /** Monotonic, so ordering survives serialisation. */
  readonly seq: number;
  /** Which decoded layer issued it. */
  readonly layer: number;
  readonly provenance: Provenance;

  readonly category: HostCategory;
  /** Canonical, engine-independent: 'fs.write', not 'IO.File.WriteAllText'. */
  readonly op: HostOp;
  /** What the front-end actually called, for the analyst. */
  readonly nativeSignature: string;

  /** Resolved values, not source text. Each carries its own taint. */
  readonly args: readonly HostArg[];

  /** What the fake returned, so the trace replays. */
  readonly result: HostResult;

  /**
   * Union of argument taint. A call whose target or arguments we could not
   * faithfully compute is evidence of an attempt, not of a fact.
   */
  readonly taint: Taint;

  /** 'chokepoint' (observed) or 'text-scan' (inferred). Never conflated. */
  readonly source: 'chokepoint' | 'text-scan';
}
```

`op` is the load-bearing field. Canonicalising at the host boundary means
`[IO.File]::WriteAllText`, `Out-File`, `Set-Content`, VBScript's
`FileSystemObject.CreateTextFile` and Python's `open(...,'w')` all land on
`fs.write`. The analyst reads one timeline; detection content is written against
one vocabulary; a new front-end inherits the entire reporting layer by emitting
the same ops.

Minimum op set, chosen to cover what commodity droppers actually do:

The table below was the planned set. `src/features/husk/host/ops.ts` is now the
authoritative one — `isHostOp` rejects anything outside it at every boundary —
and it has drifted from this: the categories are spelled `filesystem` and
`network` rather than `fs` and `net`, `sleep` moved out of `evasion` into a
`timing` category that also carries `kill-date`, `evasion` gained `sandbox`, a
`wmi` category was added, and `credential` was never built. The table is kept
as written so the drift is visible rather than quietly tidied away; read
`ops.ts` for what the code accepts.

| Category | Ops |
|---|---|
| `fs` | `read` `write` `append` `delete` `copy` `move` `mkdir` `list` `exists` |
| `registry` | `read` `write` `delete` `enumerate` |
| `process` | `start` `shell` `kill` `list` |
| `net` | `resolve` `connect` `http` `download` `upload` `listen` |
| `persistence` | `run-key` `scheduled-task` `service` `wmi-subscription` `startup-folder` |
| `assembly` | `load` `define-type` `pinvoke` `alloc-exec` |
| `evasion` | `amsi` `etw` `defender` `sleep` `vm-check` `debugger-check` |
| `credential` | `read-store` `dpapi` `keylog` |

`persistence` and `evasion` are deliberately *semantic* rather than mechanical:
a Run-key write is also `registry.write`, and the semantic op is what an analyst
greps for.

This section used to say to emit both ops for such a write. The implementation
promotes instead — one record, carrying the semantic op — and this is a reversal
of that decision, on evidence the rule predates. "Emit both" assumed one record
per operation, which is what a single fake surface produces. The wasm engine
captures the same write at four independent chokepoints, so a Run-key write
through `Set-ItemProperty` already produces two records, one from the cmdlet
hook with the parameters as the sample wrote them and one from the registry
provider with the path resolved. Emitting both ops makes that four entries in
one timeline for one write, all with the same signature and arguments, which is
not a more honest timeline but a less readable one.

Nothing is lost by promoting, because the record keeps the resolved path and the
value either way, and `categoryOf` is derived from the op rather than stored.
What is given up is the `registry.*` filter returning *every* registry write;
the path is in the record, so the question is still answerable, and
`registryWrites` in the engine analysis is built from the registry dump rather
than from ops, so the extracted-artefact view is unaffected.

Promotion lives in `host/autorun.ts`, applied in the engine adapter where all
four chokepoints funnel through one loop. Reads are never promoted: enumerating
the Run key is reconnaissance, benign software does it, and a category an
analyst filters on is only worth having if it is trustworthy.

### The fakes

**Filesystem.** In-memory tree, case-insensitive, Windows path semantics,
pre-populated with a plausible skeleton (`C:\Windows\System32`, `%TEMP%`,
`%APPDATA%`, a user profile). Writes are stored. Reads of unwritten paths return
a *typed absence* — not an empty string — so a front-end can distinguish "file
is empty" from "we do not have this", and taint the latter. Dropped content
exceeding a threshold is retained for extraction and hashed.

**Registry.** Same shape over a hive skeleton with the keys commodity samples
read before deciding what to do: `MachineGuid`, installed-software enumeration,
Defender keys, `CurrentVersion\Run`. Analyst-editable, same as the environment
block, and for the same reason — `husk-spec.md` §5 already establishes that
supplying a realistic environment is a phase 1 concern because 16% of fixtures
branch on one.

**Process table.** `start` never executes anything. It records the command line
and — this is the point — **parses it and feeds it back in as a new layer** when
it is a script interpreter. `powershell -enc <b64>`, `wscript x.vbs`,
`cmd /c ...`, `rundll32`, `mshta` are all chaining primitives, and following
them is how multi-stage samples get unrolled. The depth budget from
`husk-spec.md` commitment 4 applies.

**Network.** Default: every request is recorded and answered with a typed
absence, tainted. See §5.

---

## 4) Capture completeness

The tool's claim is "here is everything it tried to do". That claim needs a
mechanism, not a promise.

1. **Default-deny at the chokepoint.** `members.ts` resolves a member on a type
   it knows is host-reaching, and there is no `HostOp` mapped for it → that is a
   `GAP`, recorded and surfaced, not a silent pass-through. The gap ledger
   already ranks by blast radius; host-reaching gaps rank above pure-compute
   gaps because they are missed *evidence*, not just missed fidelity.
2. **A capture-completeness test.** Fixtures that perform a known host call via
   several syntactic routes — direct, aliased, computed member name, splatted,
   via `&`, via `Invoke-Expression` — must all produce the same `op`. This is
   the regression test that the regex scanner would fail today.
3. **Taint on every call.** A call assembled from values we could not compute is
   still recorded, flagged as unreliable. Attempted-but-unresolved is evidence;
   dropping it would be the dishonest failure `husk-spec.md` §1 reason 2 warns
   about.

---

## 5) Network: two origins, not a checkbox

Commitment 5 is `connect-src 'none'`, so that "never phones home" is provable
from headers rather than asserted in a README. An optional network toggle on the
same page destroys that property: CSP is set per document, and a policy that
*might* allow network is a policy that allows network.

A checkbox is also the wrong shape for the decision. Enabling network means the
analyst's IP appears in attacker telemetry, from whatever egress their browser
sits behind, and anything the sample exfiltrates leaves. That is a judgement
call about an engagement, not a preference.

So: **two separate documents, two separate policies.**

| | Locked page | Live page |
|---|---|---|
| CSP | `connect-src 'none'` | `connect-src <one analyst-configured origin>` |
| Network ops | recorded, typed absence returned | recorded, then proxied |
| Default | this one | reached deliberately |

The live page never talks to the sample's C2 directly. It talks to **one proxy
origin the analyst supplies and runs**, which is what makes attribution and
egress their decision rather than ours. A direct-from-browser fetch to
attacker infrastructure is not offered at all; it is the shape of the feature
that is unsafe, not the frequency of use.

Both pages share the engine. They differ in one CSP header and one network fake.
The build already has the Dead Letter precedent for a standalone page with its
own policy, which is the mechanism commitment 5 has been waiting on.

**Status: commitment 5 remains undelivered.** This design does not change that;
it describes the shape the delivery should take.

---

## 6) Front-ends

```ts
export interface Frontend {
  readonly language: 'powershell' | 'vbscript' | 'jscript' | 'python' | 'batch';
  analyze(source: string, host: VirtualHost, budget: Budget): void;
}
```

The host, the trace, the gap ledger, the taint model and the IOC extractor are
shared. A front-end's only job is to execute its language and emit `HostCall`s.

| Language | Approach | Notes |
|---|---|---|
| PowerShell | existing tree-walker | the one that exists; fidelity driven by §1's oracle |
| VBScript | new interpreter | small language; `FileSystemObject`, `WScript.Shell`, `XMLHTTP` bind to the fakes |
| JScript / JS | **interpreted, never native** | box-js's approach. See §7 |
| Batch | small interpreter | mostly a chaining primitive feeding the process table |
| Python | Pyodide + faked stdlib | real CPython on WASM; `os`, `socket`, `subprocess` replaced |

Two items from the original request are **not** sandbox problems:

- **MSI** is an OLE compound document with a relational database inside. Pull
  the `CustomAction`, `InstallExecuteSequence` and `Binary` tables and you have
  the behaviour statically. A parser, not a detonation. Cheap and high-yield.
- **JAR** is a zip of class files. Manifest, string constants and URLs come out
  of a static parse. A JVM is only needed for genuinely obfuscated loaders,
  which are rare in commodity IR now.

**EXE stays out of scope.** It needs x86 emulation plus a Windows userland, and
the blocker is licensing rather than engineering — a Windows image cannot be
redistributed, and ReactOS cannot run real samples. Designing for it now would
distort everything above. If it ever arrives it arrives as another `Frontend`
emitting the same ops, which is the point of the interface.

---

## 7) Threat model

What an analyst is doing is pasting live malware into a browser tab. The
question "can it escape" has three different answers depending on how the code
is executed, and the design picks the safe one in each case.

**Interpreted (PowerShell, VBScript, JScript, Batch).** The sample is data. It
never reaches the host CPU as host code. There is no memory-corruption
primitive to pivot from because the interpreter is written in a memory-safe
language. The worst outcome of an interpreter bug is wrong analysis or a hang.
This is the existing prohibition in `husk-spec.md` §3 — *the payload is data,
forever* — and it is why that prohibition is load-bearing rather than cautious.

**WASM-sandboxed (Python via Pyodide).** Linear memory, no raw host pointers, no
ambient authority, no syscalls except the imports supplied. Malicious Python
cannot reach the host because there is nothing to reach. The attack surface is
the JS interop surface, so it must stay small and explicitly enumerated. Any
future WASM engine inherits this rule.

**Native execution of attacker code: prohibited.** Running a malicious `.js`
through the browser's own engine is the tempting shortcut and it is the one real
hazard. Code in the page's origin reaches the DOM, IndexedDB where other tools'
data lives, cookies, and `fetch` with the origin's privileges — same-origin with
the rest of the shell. A sandboxed iframe without `allow-same-origin` closes
most of that, but it substitutes trusting origin isolation for simply not
executing. Interpret instead. This extends the existing prohibition from
`eval`/`Function`/`innerHTML` to cover every language the tool gains.

Kept in proportion: a browser's entire threat model is executing hostile code
from the internet, and it is the most hardened sandbox available here. Escaping
it needs a browser 0-day, which commodity samples do not carry. The realistic
risks are duller:

- **Egress and attribution** on the live page (§5). Most likely, most damaging.
- **Resource exhaustion.** Budgets have failed to bind four separate times
  during phase 1. The structural fix is a main-thread watchdog calling
  `worker.terminate()`, which does not depend on the worker being responsive.
  Still unimplemented, and now blocking: a stateful host gives anti-analysis
  loops more to chew on.
- **Storage.** Dropped-file retention must be quota-bounded and namespaced away
  from sibling tools.
- **Rendering captured content.** Every captured string is attacker-controlled.
  Text-only rendering and defanging, with no path to `innerHTML`.

---

## 8) What "100%" means here

Two ceilings, and only one of them moves.

**Implementation fidelity** — does the engine know what a given construct does?
Currently ~80% single-transform, ~50% layered, measured. The oracle in §1 is how
this reaches ~100%. It is finite work with a mechanical worklist.

**Information availability** — is the answer present in the sample at all? A
payload keyed on `$env:USERDOMAIN` the analyst does not have, a stage-2 that
exists only in a dead C2's response, an embedded PE that would need real
execution. No engine recovers these. Not SMA, not a full VM, not a real
detonation on real hardware. They are gone for everyone.

So "100% deobfuscation" is reachable and worth chasing. "All the IOCs" is not,
and the difference must stay visible in the output: an IOC that was not
recovered because of a missing member is a bug to fix, and one that was not
recovered because the C2 is dead is a fact to report. `husk-spec.md` §7's three
gap kinds already encode exactly this distinction — `GAP`, `STUB_BY_DESIGN`,
`HARD_BLOCK` — and they carry over unchanged.

The contract stays: **every unrecovered sample records a gap naming why.**

---

## 9) Build order

1. **Chokepoint capture** (§2). Move host events to `members.ts`, add the
   capture-completeness fixtures. Fixes a live defect, needs no new concepts.
2. **Worker watchdog.** Blocking for §3; already overdue.
3. **Virtual host, stateless** (§3). Formalise `HostCall`, canonical ops,
   migrate `TraceEvent`. Behaviour-preserving.
4. **Virtual host, stateful.** Filesystem and registry that read back. This is
   where multi-stage chains start unrolling.
5. **Process table chaining.** `powershell -enc`, `mshta`, `cmd /c` feed back as
   layers.
6. **The oracle** (§1). Differential harness against real PowerShell. This is
   what converts fidelity from grind to worklist.
7. **MSI parser.** Cheap, independent, high-yield; can land any time after 1.
8. **Second front-end.** VBScript or JScript, chosen by what the corpus actually
   contains rather than by preference.
9. **Two-origin split** (§5), delivering commitment 5 at last.

Python, and the live network page, follow only if the corpus justifies them.

## 10) Open questions

- **Where does the oracle run?** A local script against real PowerShell on a
  Windows host is simplest and keeps the browser clean, but it cannot run in CI
  on Linux runners. A pinned container with `pwsh` covers most of the gap, at
  the cost of 5.1-vs-7 semantic divergence — which this project has already been
  bitten by once, over the `` `e `` escape.
- **How much state is too much?** A filesystem that reads back is clearly right.
  A fake that is so complete the sample runs to completion starts to resemble
  detonation, with the dishonest-success failure mode of §1 reason 2. The taint
  model is the brake, but where the line sits is unresolved.
- **Does statefulness weaken the honesty guarantee?** A synthesised registry
  value that a sample branches on produces one real path and hides another.
  Recording both branches as unexplored is possible but changes the execution
  model substantially.
- **Corpus for the new front-ends.** The PowerShell corpus took real effort to
  assemble and must never enter the repository. The same constraint applies and
  the same solution should be reused.
