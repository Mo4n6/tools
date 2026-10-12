# Porting PowerShell to browser-wasm: working log

**Status:** **real PowerShell deobfuscates in a browser, and the corpus says
the engine beats the tree-walker outright.**

|                        | tree-walker | engine     |
| ---------------------- | ----------- | ---------- |
| single-transform (244) | 80.7%       | **97.5%**  |
| layered (864)          | 50.2%       | **100.0%** |

219 cmdlets and 128 aliases live, in a 15.95 MB gzipped bundle. Runs on
**ordinary static hosting** — no
cross-origin isolation headers; `file://` does not, for an unrelated loader
reason. Five fixtures miss in total, and none of them for a reason
patching PowerShell can fix: four depend on .NET Framework's own reflection
member order and one is a corpus defect. See the corpus section.

Sixteen real source patches, 1,528 insertions across 21 files — seven
portability guards, three deliberate Windows PowerShell 5.1 fidelity patches,
a cmdlet-level capture layer, the step and time budgets, a managed AES, and
one build exclusion that halves the bundle. The fidelity patches are the ones
that moved the corpus number: without them the engine scored **11.5%**.

This is a work log, not a spec. It exists so the work can be resumed from a
cold container, because the scratchpad does not survive one. `husk-spec.md` §1
holds the decision and the measurements; this holds the mechanics.

**Goal:** run real PowerShell in a browser tab, with managed fakes for the
Windows surfaces (COM, WMI, registry, P/Invoke), so that a sample executes
fully and every host call is captured as an IOC.

---

## Environment setup, from scratch

The .NET CDN is blocked by this environment's network policy. `dot.net` and
`builds.dotnet.microsoft.com` both 403 at the proxy. **Do not** use
`dotnet-install.sh`; it will fail.

NuGet (`api.nuget.org`) and `packages.microsoft.com` **are** reachable, and
Ubuntu 24.04 carries the SDK in its own archive. This works:

```bash
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq dotnet-sdk-8.0   # 8.0.131
dotnet workload install wasm-tools                                      # pulls from NuGet, fine
```

Chromium for driving the result is pre-installed; do **not** run
`playwright install`:

```
/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

Playwright resolves only from the repo, so a driver script has to live in the
repo root (e.g. `ps-run.local.mjs`, gitignored by the root `*.mjs` rule) rather
than in the scratchpad.

---

## What is known to work

Measured 2026-10-11, headless Chromium against a local static server:

|                       |                                      |
| --------------------- | ------------------------------------ |
| Runtime boot          | 0.9–1.1 s                            |
| Assemblies registered | 183                                  |
| SMA managed IL        | loads — mono-wasm does not reject it |
| Bundle                | 31 MB raw, **11.26 MB gzipped**      |

## The assembly-injection trick

`System.Management.Automation` 7.4.6 has **no `runtimeTargets` for
browser-wasm** — only `compile` (a reference assembly). The package ships
implementations for `unix` and `win` RIDs only. A project referencing it
**builds clean with 0 errors and produces a bundle containing no SMA at all.**
Check the assembly list, never the exit code.

Three MSBuild routes were tried and all are silently ignored, because the wasm
pipeline builds its list from the runtime pack and package runtime assets:

- `<Reference>` with `<Private>true</Private>`
- `ExcludeAssets="runtime"` plus `<Reference>`
- `<WasmAssembliesToBundle>`

What does work is injecting by hand after publish:

1. Set `<WasmEnableWebcil>false</WasmEnableWebcil>` so assemblies stay plain
   `.dll` instead of webcil-wrapped `.wasm`.
2. Copy the assemblies into `AppBundle/_framework/`.
3. Register each in `AppBundle/_framework/blazor.boot.json` under
   `resources.assembly` as `"<name>.dll": "sha256-<base64 of sha256>"`.
   The runtime verifies these hashes, so they must be correct.

`scripts/husk/wasm-spike/rebuild.sh` does the publish and the injection in one
step. It expects:

- the wasm app at `$SP/pswasm` (from `scripts/husk/wasm-spike/*`)
- SMA's dependency closure at `$SP/deps/out`

## Harvesting SMA's dependency closure

The wasm publish does not bring SMA's dependencies. Get them from an ordinary
`linux-x64` publish and inject all 14:

```bash
mkdir deps && cd deps
cat > deps.csproj <<'EOF'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <RuntimeIdentifier>linux-x64</RuntimeIdentifier>
    <SelfContained>false</SelfContained>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="System.Management.Automation" Version="7.4.6" />
  </ItemGroup>
</Project>
EOF
dotnet publish -c Release -o out
```

Yields: `Microsoft.ApplicationInsights`, `Microsoft.Management.Infrastructure`,
`Microsoft.Win32.Registry.AccessControl`, `Newtonsoft.Json`, `System.CodeDom`,
`System.Configuration.ConfigurationManager`, `System.Diagnostics.EventLog`,
`System.DirectoryServices`, `System.Management.Automation`, `System.Management`,
`System.Security.Cryptography.Pkcs`, `System.Security.Cryptography.ProtectedData`,
`System.Security.Permissions`, `System.Windows.Extensions`.

Never shadow an assembly the runtime pack already ships; skip any name already
present in `blazor.boot.json` (SMA itself excepted).

---

## Blocker chain

Each is a platform assumption in SMA. Resolved in order; each new one only
appears once the previous is cleared.

### 1. `TypeLoadException` — `ApplicationInsightsTelemetry` — RESOLVED

Dependency closure missing from the wasm publish. Fixed by the harvest above.

### 2. `ArgumentNullException (path1)` — `PSSnapInReader.ReadCoreEngineSnapIn` — WORKED AROUND

SMA derives `$PSHOME` from `typeof(PSObject).Assembly.Location`, which is `""`
under wasm, so `Path.GetDirectoryName("")` returns `null` and the next
`Path.Combine` throws.

Setting `AppDomain.CurrentDomain.SetData("APP_CONTEXT_BASE_DIRECTORY", ...)`
does **not** help — `AppContext.BaseDirectory` is captured at startup.

Worked around by using `InitialSessionState.Create()` (empty) rather than
`CreateDefault2()`, which skips the core snap-in import. **Cost: no cmdlets.**
The language engine is what deobfuscation needs, but `Invoke-Expression` is
itself a cmdlet, so this almost certainly has to be solved properly in the
fork rather than avoided.

### 3. `TypeInitializationException` — `Tracing.PSSysLogProvider` — RESOLVED

Its static initializer P/Invokes `libpsl-native` (syslog). There is no wasm
build of that native library. Not fixable from outside SMA's source.

Full stack from blocker 2, for reference on how to read these:

```
at System.IO.Path.Combine(String path1, String path2)
at System.Management.Automation.PSSnapInReader.ReadCoreEngineSnapIn()
at System.Management.Automation.Runspaces.InitialSessionState.ImportCorePSSnapIn()
at System.Management.Automation.Runspaces.InitialSessionState.CreateDefault2()
```

---

## Next steps — only if the hosting model changes

These were the plan before the threading result. Kept because they are still
correct _if_ Husk ever moves behind a server that sets COOP/COEP.

1. **Clone PowerShell shallow.** `git clone --depth 1 -b v7.4.6
https://github.com/PowerShell/PowerShell`. GitHub is reachable.
2. **Do not use `build.psm1`.** It is written in PowerShell and needs a working
   `pwsh` to bootstrap, which is not installed. Build
   `src/System.Management.Automation/System.Management.Automation.csproj`
   directly with `dotnet build` and a `browser-wasm` RID.
3. **Patch the platform assumptions** as they surface. Expected first patches:
   - `Utils.GetApplicationBase` — fall back to `AppContext.BaseDirectory` when
     `Assembly.Location` is empty.
   - `PSSysLogProvider` — stub the syslog P/Invoke under `OperatingSystem.IsBrowser()`.
   - Anything else reaching `libpsl-native`.
4. **Keep a patch series**, not a mutated checkout, so it can be rebased onto
   a newer PowerShell.

## Threading: not a gate after all

**Corrected 2026-10-11.** An earlier entry here concluded that threading ended
this approach and cost static hosting. That was wrong, and the mistake is worth
keeping because it was a reasoning error rather than a measurement error.

The probe was real:

```
Thread.Start     = PlatformNotSupportedException
Task.Run + Wait  = timeout
```

`Task.Run(...).Wait()` genuinely deadlocks single-threaded — the continuation
is queued to the thread that is blocking. The error was generalising from that
synthetic probe to PowerShell, on the reasoning that `PowerShell.Invoke()` is
"exactly that pattern". **It is not, with `PSThreadOptions.UseCurrentThread`:**
the pipeline runs inline on the calling thread and never queues work it then
waits for. I should have tested PowerShell rather than a proxy for it.

With all patches applied, `WasmEnableThreads=false`, and **no isolation
headers of any kind**:

```
crossOriginIsolated = false     SharedArrayBuffer = undefined
init          (627ms) => OK
arithmetic    (149ms) => 4
concat        ( 14ms) => abcd
reverse       ( 91ms) => string
-f operator   ( 10ms) => IEX
b64 decode    ( 62ms) => hello stage 2
type+method   ( 18ms) => eA==
```

So **ordinary static hosting works**. No COOP/COEP, no `SharedArrayBuffer`, no
service-worker header shim. GitHub Pages serves this as-is.

Threads still work if enabled, and still require all three headers
(`Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Embedder-Policy: require-corp`,
`Cross-Origin-Resource-Policy: same-origin`). Keep them off unless something
later actually needs them, since they cost the hosting freedom for nothing.

### `file://` does not work, for an unrelated reason

```
file:// loader ready = false
[console] Access to script at 'file:///...' ... net::ERR_FAILED
```

Chrome blocks ES module scripts loaded from `file://` origins. That is a
loader/CORS constraint affecting any .NET wasm app, not a threading or
PowerShell issue, and no patch here changes it. The engine bundle is 183 files
and 12 MB gzipped, so it was never going to be a Dead-Letter-style single
downloadable file regardless.

If a disk-runnable copy ever matters, that is the existing tree-walker's
property to keep, not this one's to gain.

## Building SMA for browser-wasm

`pwsh` is already on the box at `/usr/bin/pwsh`; check before installing
anything. PowerShell's build needs it for the generation steps.

```bash
cd PowerShell
pwsh -NoProfile -c 'Import-Module ./build.psm1 -Force; Start-ResGen; Start-TypeGen'
```

Both are required. Without them the build emits **7,714 × CS0103** for missing
`*Strings` resource classes, because `dotnet build` on the csproj alone skips
PowerShell's own codegen. That was 4,321 errors reduced to 264 by running them.

Then:

```bash
dotnet build src/System.Management.Automation/System.Management.Automation.csproj \
  -c Release -r browser-wasm --self-contained false -p:OutputType=Library \
  -p:EnableTrimAnalyzer=false -p:SuppressTrimAnalysisWarnings=true \
  -p:TreatWarningsAsErrors=false -p:WarningsAsErrors= \
  -p:EnableAotAnalyzer=false -p:EnableSingleFileAnalyzer=false
```

`OutputType=Library` is needed because the wasm RID otherwise demands a `Main`.
The analyzer switches turn off IL trim warnings that PowerShell promotes to
errors (264 of them, all advisory).

Output: `src/System.Management.Automation/bin/Release/net8.0/browser-wasm/System.Management.Automation.dll`, **6.38 MB**.

## The patch series

`scripts/husk/wasm-spike/patches/0001-powershell-browser-wasm.patch` — the whole
port is **1,528 insertions across 21 files**. Apply to a clean `v7.4.6`
checkout.

Three are environment-only, needed because of this network policy:

1. `global.json` — SDK pin 8.0.403 → installed 8.0.131 with `rollForward`.
2. `nuget.config` — PowerShell's private Azure feed is blocked; nuget.org has
   everything the SMA project references.
3. `PSVersionInfoGenerator.csproj` — Roslyn 4.9.2 → 4.8.0, because SDK 8.0.131
   ships the 4.8 compiler and the newer SDK is not installable here.

Seven are real port patches, each guarding a platform assumption:

4. **`engine/Utils.cs` — `GetApplicationBase`.** Returns
   `Path.GetDirectoryName(assembly.Location)`; `Location` is `""` for
   assemblies loaded from the boot manifest, so this returns `null` and every
   downstream `Path.Combine` throws. Falls back to `AppContext.BaseDirectory`,
   which is `/` under mono-wasm. **This one patch cleared two separate
   blockers** — `PowerShellConfig..ctor` and `ReadCoreEngineSnapIn`.
5. **`utils/tracing/SysLogProvider.cs`.** Four `libpsl-native` P/Invokes
   (`OpenLog`, `SysLog` ×2, `CloseLog`) guarded by `OperatingSystem.IsBrowser()`.
   No wasm build of that library exists.
6. **`CoreCLR/CorePsAssemblyLoadContext.cs` — `NativeDllHandler`.** Returns
   `IntPtr.Zero` under browser instead of building a probe path from a null
   directory.
7. **`engine/SessionState.cs` — `$PID`.** `Process.GetCurrentProcess()` is
   unsupported in a browser; `$PID` is `0` there.
8. **`namespaces/EnvironmentProvider.cs`.** `$env:` lookups are
   case-insensitive on Windows and case-sensitive everywhere else, and
   obfuscators write `$env:ComSpec` in whatever case they like.
9. **`utils/PsUtils.cs` — `GetNativeThreadId`.** Returns the managed thread id
   under browser. Every `InformationRecord` carries a native thread id, so the
   unguarded P/Invoke made **every `Write-Host` throw
   `DllNotFoundException`** — and `Write-Host` is the payload in most samples.
10. **`CoreCLR/CorePsPlatform.cs`.** The remaining 15 `libpsl-native` call
    sites (`IsExecutable`, `GetPPid`, `KillProcess`, `GetLinkCount`,
    `GetCommonStat`, `GetErrorCategory`, the link and date setters …), each
    answered with the inert value rather than a throw. They all ask a question
    about a real machine, and there is not one.

Three more are **deliberate Windows PowerShell 5.1 fidelity patches**, not
portability fixes. Samples are written against 5.1, the corpus was generated
against 5.1, and on each of these points 7.x diverges in a way that changes
what a payload decodes to. Together they took single-transform recovery from
11.5% to 95.1%:

11. **`engine/SessionState.cs` — `$PSHOME`.** Set to
    `C:\Windows\System32\WindowsPowerShell\v1.0` under browser.
    `&($pSHOME[4]+$psHOME[30]+'x')` spells `iex` by indexing into that exact
    string, and Invoke-Obfuscation emits four index variants of it
    (`[4]`/`[21]` for `i`, `[30]`/`[34]` for `e`). Against a browser
    application base those indices spell nonsense like `oX`, and the sample
    dies at command resolution instead of decoding. **204 fixtures.** The
    variable is `Constant`, so a host cannot override it after `Open` — this
    has to be a source patch. Nothing else in the engine reads it; path
    resolution goes through `Utils.DefaultPowerShellAppBase`, unchanged.
12. **`engine/CoreAdapter.cs` — `String.Split` overload set.** On .NET Core,
    `'4a:4b'.Split(':x')` binds to `Split(string, StringSplitOptions)` and
    splits on the whole separator, finding nothing; .NET Framework has no such
    overload, so it binds `Split(char[])` and splits on either character.
    Obfuscators pass a bag of separator characters as one string and rely on
    the second reading — the first yields one undecodable token and
    `[Convert]::ToInt16` throws "additional non-parsable characters".
    **115 fixtures.** Hiding the post-4.8 overloads restores the 5.1 binding.
13. **`engine/parser/tokenizer.cs` — the `` `e `` escape.** ESC in
    PowerShell 6+, a literal `e` in 5.1. ``Wri`e-`Host`` has to tokenize as
    `Write-Host`, not as a command name with two invisible ESCs in it.
    **29 fixtures.**

One is the fourth capture layer:

14. **`engine/CommandProcessorBase.cs` + `engine/CommandProcessor.cs` —
    cmdlet-level capture.** A `HuskRecord()` call before `BeginProcessing` and
    once per pipeline object, feeding a cmdlet table in `HuskHostHook`. See
    "Cmdlet-level capture" below for why the other three layers could not do
    this.

And one is the budget:

15. **`engine/parser/Compiler.cs` and
    `engine/interpreter/PowerShellInstructions.cs` — `HuskHostHook.Tick()` at
    every sequence point.** Both paths, because PowerShell interprets a script
    block before it compiles one. See "Budgets" below.

And one is the crypto:

16. **`security/HuskAes.cs` (new) and `security/SecureStringHelper.cs` — a
    managed AES-CBC.** Because the browser has none. See "Managed AES" below.

Plus `engine/HuskHostHook.cs` itself, which is new and holds much of the above:
the classification tables, the cmdlet table, the budget, the sleep clamp and
the seal.

## Measured, with all patches applied

|                   |                  |
| ----------------- | ---------------- |
| Boot              | ~0.95 s          |
| `Runspace.Open()` | 589 ms           |
| Bundle            | 12.30 MB gzipped |
| SMA               | 6.38 MB          |

```
arithmetic    (182ms) => 4
concat        ( 11ms) => abcd
reverse       ( 69ms) => string        [array]::Reverse round-trip
-f operator   ( 10ms) => IEX
IEX           --      => not recognized
```

## Cmdlets: Commands.Utility

Built with the **same recipe as SMA and zero source patches**. Two gotchas:

**Version skew.** SMA builds as `7.4.5.0` while Commands.Utility builds as
`7.4.6.0` and references SMA `7.4.6.0`, so the app fails to compile with
CS1705. The version comes from `git describe` through
`PowerShell.Common.props`, and `PSCoreBuildVersion`/`Version` do not move it.
Pin it directly:

```
-p:AssemblyVersion=7.4.6.0 -p:FileVersion=7.4.6.0
```

Build **Commands.Utility only** — it builds SMA transitively, and taking both
DLLs from its output guarantees one consistent pair:

```
src/Microsoft.PowerShell.Commands.Utility/bin/Release/net8.0/browser-wasm/
  Microsoft.PowerShell.Commands.Utility.dll   0.78 MB
  System.Management.Automation.dll            6.38 MB
```

**Do not reference Utility at compile time.** The compile-time identity has to
match the runtime one exactly, which is fragile across two builds. Load it by
name instead and the problem disappears:

```csharp
var utility = Assembly.Load("Microsoft.PowerShell.Commands.Utility");
```

### Registering the cmdlets

`$PSHOME` is `/` with no module layout, so `CreateDefault2()` succeeds and
registers nothing. Walk the assembly instead — every `[Cmdlet]`-attributed
public type becomes a `SessionStateCmdletEntry`. That is `RegisterCmdlets` in
`Program.cs`, and it is 115 cmdlets from Utility on top of the core set.

### Dependency closure

Harvest the same way as SMA's, from a `linux-x64` publish of Commands.Utility
(27 DLLs: Markdig, MarkdownRender, JsonSchema.Net, Roslyn, Humanizer,
System.Drawing.Common and friends). **Then overwrite SMA and Utility with the
browser-wasm builds** — the harvest carries linux-x64 copies of both and they
must not win.

## Measured, with cmdlets

|                   |                          |
| ----------------- | ------------------------ |
| Boot              | ~1.5 s                   |
| `Runspace.Open()` | 582 ms                   |
| Cmdlets           | 115 registered, 162 live |
| Assemblies        | 196                      |

```
IEX literal    ( 21ms) => deobfuscated
IEX base64     ( 99ms) => hello stage 2
alias iex      ( 21ms) => aliasworks
&('I'+'E'+'X') ( 13ms) => worked
Write-Output   ( 14ms) => wo
ConvertTo-Json (113ms) => {"a":1}
-f + IEX       ( 47ms) => foobar
```

`IEX` over base64 is the deobfuscation primitive, and `&('I'+'E'+'X')` shows
obfuscated invocation resolving. The engine does what the tree-walker was built
to approximate.

## Host capture: what is faked so far

### The boundary

Proxy cmdlets alone would be bypassable — `[IO.File]::WriteAllText` walks past
a proxied `Out-File`. But **the wasm boundary sits below .NET**: every file
write lands in the in-memory filesystem, and every HTTP call goes out through
the JS `fetch` that .NET's browser stack binds at startup. Nothing in
PowerShell can route around either. That is the chokepoint the tree-walker had
by construction, recovered here by other means.

`fetch` must be replaced **before `dotnet.create()`**, and runtime assets
(`/_framework/`, `.dll`, `.wasm`, `.dat`) must pass through untouched or
nothing boots.

### Dropped files — working

Capture is a diff: `SnapshotFs()` before the sample, walk after. Each dropped
file reports path, size, SHA-256 and the first 16 bytes as hex, so a PE header
is visible in the listing without downloading anything.

```
/tmp/payload.exe   8B  sha256=2e383fddf78d1acc…  head=4d5a900003000000
/tmp/note.txt     13B  sha256=2e700932698edaa8…  head=64726f70706572206e6f74650a
```

`4d5a` is `MZ`. Both were produced by a sample doing
`[IO.File]::WriteAllBytes` and `Out-File`.

`saveDropped(path)` hands one to the analyst as `<name>.malware` — suffix
appended rather than replacing the extension, so `payload.exe.malware` keeps
the original name readable in a ticket while being undoubleclickable.

### Network — blocked and recorded, but not yet from the cmdlets

Verified: a JS `fetch` returns `523 Husk: network blocked` with
`X-Husk-Blocked: 1`, `HttpClient`'s request was **recorded and blocked**, and
the real server saw **0 hits**.

```
JS fetch           => 523, blocked header present
HttpClient         => recorded at the boundary, blocked, then threw
WebClient          => MethodInvocationException (unsupported on wasm)
Invoke-WebRequest  => PlatformNotSupportedException, NOT recorded
real server hits   => 0
```

**The gap that matters:** PowerShell's web cmdlets use sync-over-async
internally, which is unsupported single-threaded, so they throw _before_
reaching the boundary. Safety is intact — nothing escapes — but the C2 URL is
lost, and that is usually the one indicator the analyst came for. A sample
doing `DownloadString('http://c2/')` currently produces an exception rather
than an IOC.

That is the dishonest-failure mode `husk-spec.md` §1 warns about, arriving
from the other direction.

## Web proxies — working, with a named blind spot

PowerShell functions outrank cmdlets in command resolution, so defining
`Invoke-WebRequest`, `Invoke-RestMethod`, `Start-BitsTransfer` and `New-Object`
as functions shadows the real ones. They record and return a typed absence
instead of throwing, so execution continues and the URL survives.

The real `New-Object` is captured by reference at install time
(`Get-Command -CommandType Cmdlet`) before the proxy shadows it. Module
qualification does **not** work here: cmdlets are registered directly rather
than as modules, so there is no `Microsoft.PowerShell.Utility` to qualify with.

Measured against a cradle-shaped sample:

```
[proxy] network.client    New-Object Net.WebClient              ["Net.WebClient"]
[proxy] network.http      Net.WebClient.DownloadString          ["GET","http://…/stage2.ps1"]
[proxy] network.download  Net.WebClient.DownloadFile            ["http://…/p.exe","/tmp/p.exe"]
[proxy] filesystem.write  Net.WebClient.DownloadFile            ["/tmp/p.exe"]
[proxy] network.http      Invoke-WebRequest                     ["GET","http://…/iwr"]
[proxy] network.http      Invoke-WebRequest                     ["GET","http://…/alias"]
[proxy] network.http      Invoke-RestMethod                     ["GET","http://…/api"]
[proxy] process.start     New-Object -ComObject WScript.Shell   ["WScript.Shell"]
[proxy] process.start     WScript.Shell.Run                     ["powershell -enc ZQBj"]
[proxy] registry.write    WScript.Shell.RegWrite                ["HKCU:\…\Run\evil","payload"]
real server hits: 0
```

`DownloadFile` emits both `network.download` and `filesystem.write`, as the op
vocabulary intends. `New-Object System.Text.StringBuilder` still returns a real
StringBuilder, so the fall-through is intact.

### The blind spot, measured

Three ways around the proxy layer were tested:

```
[Net.WebClient]::new().DownloadString(…)        THREW MethodInvocationException
(& (Get-Command New-Object -CommandType Cmdlet) Net.WebClient).DownloadString(…)
                                                THREW MethodInvocationException
Remove-Item function:New-Object; New-Object …   THREW CommandNotFoundException

proxy-recorded: 0    boundary-recorded: 0    real server hits: 0
```

**Safety holds** — nothing escaped, because real `Net.WebClient` does not work
on wasm anyway. **Telemetry does not**: a bypass produces _silence_ rather than
a record. A sample using `[Net.WebClient]::new()` yields no IOC at all.

So the honest statement is: proxies are **telemetry, not containment**. They
cover the cradles commodity droppers actually use, and they are bypassable by
anything that reaches .NET directly. The `fetch` boundary underneath is the
containment layer, and it is not bypassable — but it only sees calls that get
far enough to make an HTTP request, which these do not.

Silence is the wrong failure. This is the same "missed syscall is invisible"
problem that argued against the engine in the first place, now measured rather
than predicted.

### The fix direction

Record at the .NET member-invocation level rather than the cmdlet level. We
have the PowerShell fork, so the chokepoint `husk-spec.md` commitment 3
describes is reachable: patch the binder so every member call on a
host-reaching type is recorded regardless of how the script got there. That
turns a bypass from silence into a record, which is the property the whole
design rests on.

## Binder-level capture — the blind spot, closed

Proxy functions are bypassable by anything reaching .NET directly. The fix is
to record where the engine actually resolves a method, which we can do because
we own the fork.

**The first attempt hooked the wrong place.** `DotNetAdapter.AuxiliaryMethodInvoke`
in `CoreAdapter.cs` looks like the chokepoint, and it is — for the _interpreted_
path. Compiled script does not go through it: the DLR binder emits a direct
call to the resolved `MethodInfo`. Hooking it produced zero records while
`[IO.File]::WriteAllText` plainly ran.

The real chokepoint for compiled script is
`PSInvokeMemberBinder.InvokeMethod` in `engine/runtime/Binding/Binders.cs`.
Rather than editing inside that long method, the port renames it to
`InvokeMethodCore` and interposes a wrapper that classifies `mi`, and when it
is host-reaching wraps the generated expression:

```csharp
Expression.Block(generated.Type, record, generated)     // observed
Expression.Block(generated.Type, record, default)       // refused (network)
```

Void returns take `Expression.Empty()`; a refused call hands back a default of
the right type so the script keeps running rather than taking an exception.

`HuskHostHook` (new file, `engine/HuskHostHook.cs`) holds the classification
table and a settable `OnHostCall` the host wires up. A namespace fast-path
rejects the overwhelming majority of calls, because this runs on every method
PowerShell binds.

### Measured

Direct .NET calls, which never touch a proxy:

```
[binder] filesystem.write   System.IO.File.WriteAllText         ["/tmp/direct.ps1","dropped via direct .NET"]
[binder] filesystem.read    System.IO.File.ReadAllText          ["/tmp/direct.ps1"]
[binder] filesystem.delete  System.IO.File.Delete               ["/tmp/direct2.txt"]
[binder] filesystem.write   System.IO.Directory.CreateDirectory ["/tmp/sub"]
[binder] network.http       System.Net.Http.HttpClient..ctor    []
[binder] assembly.load      System.Reflection.Assembly.Load     ["<byte[2]>"]
real server hits: 0
```

Arguments come through resolved, not as source text — the written _content_ is
captured alongside the path, and a byte array renders as `<byte[2]>` rather
than being dumped.

**Not proven:** the test also tried `Remove-Item function:New-Object` to delete
the proxies first, and that silently failed because `Remove-Item` lives in
Commands.Management, which is not built. The calls above bypass proxies by
construction, so the result stands, but the explicit deletion case is untested.

### Three layers now

| Layer            | Sees                               | Bypassable          |
| ---------------- | ---------------------------------- | ------------------- |
| Proxy functions  | cmdlet/COM cradles, rich arguments | yes                 |
| **Binder hook**  | **every .NET method call**         | **no, from script** |
| `fetch` boundary | anything reaching HTTP             | no                  |

Filesystem calls are deliberately _not_ blocked — letting a sample drop its
payload into the in-memory filesystem is how the analyst extracts it
afterwards. Network is refused at the binder, so the sample sees a null rather
than an exception.

## Commands.Management — built, and it corrected the layer model

Built first try with the same recipe, and it brings
`Microsoft.PowerShell.Security` with it. **173 cmdlets registered, 220 live.**

With `Remove-Item` available, the bypass that was previously untestable can be
run for real:

```
Remove-Item function:New-Object -Force
"proxies removed: $(-not (Test-Path function:New-Object))"   => True
New-Object Net.WebClient                                     => real cmdlet, ctor threw
Set-Content -Path /tmp/dropped-by-cmdlet.txt -Value '…'      => file written
New-Item -Path /tmp/newitem.txt -ItemType File               => file written

captured host calls : 0
dropped files       : both, captured
real server hits    : 0
```

### The correction

I described the binder hook as seeing "every .NET method call". It does not.
**The DLR binder only sees calls made from script.** Cmdlets are compiled C#
that call .NET directly, so `Set-Content`'s write never passes through
`PSInvokeMemberBinder`. Neither does `New-Object`, which uses
`Activator.CreateInstance` — which is why the WebClient constructor threw
instead of being intercepted and blocked.

So the layers divide by _origin of the call_, not by bypassability alone:

| Layer               | Sees                               | Blind to                             |
| ------------------- | ---------------------------------- | ------------------------------------ |
| Proxy functions     | cmdlet invocations, rich arguments | anything that deletes or avoids them |
| Binder hook         | .NET calls **made from script**    | cmdlet internals, `New-Object`       |
| `fetch` boundary    | HTTP from anywhere                 | non-HTTP                             |
| **Filesystem diff** | **file writes from anywhere**      | nothing, for files                   |

The filesystem diff turns out to be the most robust of the four: it is
origin-independent by construction, which is why `Set-Content` and `New-Item`
showed up as dropped files despite producing no host-call record. Evidence
survived even though telemetry did not.

### What this leaves open

- **`New-Object` must stay proxied.** It cannot be caught at the binder, so
  the proxy is load-bearing rather than merely convenient, and its deletion is
  a real gap rather than a theoretical one.
- The safety story is unchanged: nothing escaped in any variant.

## Cmdlet-level capture — the fourth layer

The binder hook sees what _script_ calls. A cmdlet's own internals are
invisible to it, which was not a detail: `Set-ItemProperty` writing a Run key
and `Out-File` dropping a payload produced **no record at all**, measured with
`scripts/husk/wasm-spike/capture-probe.mjs`. Those are two of the three things
an analyst most wants.

`HuskHostHook.RecordCmdlet` closes it, called from `CommandProcessorBase` —
the one place every command invocation passes through with its parameters
bound. Two call sites, for two reasons:

- **Before `BeginProcessing`**, because a cmdlet that throws there never
  reaches `ProcessRecord`, and `Start-Process` does exactly that in a browser:
  it builds a `ProcessStartInfo`, which is unsupported. Recording only later
  lost the single most telling IOC a dropper produces.
- **Once per pipeline object**, because a path bound from the pipeline is not
  known before the loop. `'a','b' | Set-Content` records two writes, not one.

A signature comparison per invocation keeps a repeated call from recording
twice. Script cmdlets are skipped: an advanced function arrives here too, and
Husk's own proxy functions record themselves.

The table is in two halves, because the op is not always decidable from the
cmdlet name. `Out-File` is always a file write; `New-Item` is a file or a
registry key depending on the path, so the provider-generic cmdlets are
classified per call from the path itself.

**A sample cannot reach around this.** It can shadow a cmdlet's _name_ with a
function, but then it is not that cmdlet running.

### Sources are labelled, and deliberately not deduplicated

`OnCmdletCall` is a separate sink from `OnHostCall`, so a record says where it
came from: `binder` means the script reached for a .NET method, `cmdlet` means
it used the cmdlet, `provider` means the write actually happened, `proxy` means
a Husk function answered. A registry write through `Set-ItemProperty` therefore
produces two records — the cmdlet's _intent_, with the parameters as written,
and the provider's _effect_, with the path resolved and the value as stored.

Those differ whenever the path is computed, which is most of the time in
obfuscated code, so collapsing them in the engine would throw away evidence.
The reporting layer collapses them for display; the capture layer does not.

## The virtual registry — a provider, not proxies

`Set-ItemProperty HKCU:\…\Run` used to fail at **"cannot find drive HKCU"**:
there is no registry in a browser at all, and `Microsoft.Win32.Registry` throws
`PlatformNotSupportedException` on wasm. Every persistence attempt aborted the
sample at the exact moment it revealed itself.

`scripts/husk/wasm-spike/HuskRegistry.cs` is an in-memory registry behind a
real PowerShell provider, named `Registry` so that both `HKCU:\…` and
`Registry::HKEY_CURRENT_USER\…` resolve the way a sample expects. Five drives
(HKCU, HKLM, HKCR, HKU, HKCC), hive abbreviations accepted in paths as well as
drive names, `IPropertyCmdletProvider` and `IDynamicPropertyCmdletProvider` so
the whole `*-ItemProperty` family works.

A provider rather than proxy functions, for three reasons that all matter:

1. The registry cmdlets _talk to a provider_. Install one and they work as
   written — no per-cmdlet proxy to write, and new cmdlets inherit it.
2. The record is taken where the write happens, with the path resolved and the
   value as stored, rather than from the arguments as the sample spelled them.
3. A sample can delete a proxy function. It cannot delete a provider.

The path methods (`MakePath`, `GetParentPath`, `GetChildName`) are overridden
rather than inherited: the base implementations join with the platform
separator, which is `/` here, and a registry path with forward slashes in it
matches nothing a sample writes.

Seeded with the persistence locations pre-created (so an enumeration succeeds
rather than erroring), and with plausible values under
`Windows NT\CurrentVersion`, `Shell Folders` and `Windows Defender` — the keys
samples read to decide whether to run. Same rule as the environment block:
plausible defaults, not real ones.

`RegistryDump()` returns the registry as the sample left it. The op timeline
says what was attempted; the dump says what the machine would look like
afterwards, which is the artefact an analyst compares against a known-good
image.

### Measured

`capture-probe.mjs` against `probes/host-calls.ps1`, every line recorded:

| what the sample does                        | recorded as             | layer             |
| ------------------------------------------- | ----------------------- | ----------------- |
| `[IO.File]::WriteAllText`                   | `filesystem.write`      | binder            |
| `Out-File` / `Set-Content` / `New-Item`     | `filesystem.write`      | cmdlet            |
| `'a','b' \| Set-Content`                    | two `filesystem.write`  | cmdlet            |
| `Get-ChildItem C:\…`                        | `filesystem.list`       | cmdlet            |
| `Set-ItemProperty HKCU:\…\Run`              | `registry.write` ×2     | cmdlet + provider |
| `New-Item HKCU:\…`                          | `registry.write` ×2     | cmdlet + provider |
| `Get-ChildItem HKCU:\…`                     | `registry.enumerate` ×2 | cmdlet + provider |
| `[Microsoft.Win32.Registry]::SetValue`      | `registry.write`        | binder            |
| `Start-Process`                             | `process.start`         | cmdlet            |
| `[Diagnostics.Process]::Start`              | `process.start`         | binder            |
| `(New-Object Net.WebClient).DownloadString` | `network.http`          | proxy             |
| `Invoke-WebRequest`                         | `network.http`          | proxy             |

Registry and process calls are now **recorded and then refused** rather than
run: `HuskHostHook.IsBlocked` covers `registry.*` and `process.*` alongside
`network.*`. Those two are not a policy choice the way network is — the real
APIs throw in a browser — so refusing after recording is what keeps the sample
alive past the reveal. Verified: `Start-Process "calc.exe"; "after"` prints
`after`.

Also fixed here: a `C:` drive. Without one, `Out-File C:\Users\Public\x.txt`
failed with "could not find a part of the path /C/Users/Public/x.txt" — the
Unix FileSystemProvider has one root, so a Windows path becomes a relative one
and the directories do not exist. Every filesystem cmdlet a dropper uses died
there, _before dropping anything_. There is now a Windows-shaped tree behind a
real `New-PSDrive`, with the directories samples actually write to.

And `HuskHost.Drain` now really drains. It did not, so every run in a batch
inherited the previous one's IOCs — a report belongs to one sample.

## Budgets — a delay loop no longer hangs the tab

A browser tab has one thread and Husk runs the pipeline on it, so **nothing
outside can interrupt a `while ($true) {}`**: a timer cannot fire while
`Invoke` owns the thread, and `PowerShell.Stop()` has no thread to run on.
There is no watchdog available. The limit has to be inside the engine.

`HuskHostHook.Tick()` is emitted at every **sequence point** — the one place
the engine passes through on each statement — and throws over budget. Two
numbers, both the host's to set: 20 million statements, and 10 seconds.

Three details decided this:

**Both execution paths need it.** The first attempt hooked only
`UpdatePositionExpr.Reduce()`, which is the _compiled_ path, and a 2-statement
budget let a 4-statement script run to completion. PowerShell interprets a
script block before it compiles one, and a delay loop never runs often enough
to get compiled — so the interpreted path, `UpdatePositionInstruction.Run`, is
the one that actually needed the check.

**It throws `PipelineStoppedException`, deliberately.** The compiler emits
`catch (PipelineStoppedException) => rethrow` around every script `try` and
`trap` (Compiler.cs:5290, 5433), so a sample cannot swallow it. Verified:
`while ($true) { try { $i++ } catch { } }` stops at the time budget rather
than spinning forever. Any ordinary terminating error would have been caught
by that `catch` and the loop would have carried on.

**A budget stop is reported as a partial result, not an error.** Everything up
to the cutoff is still evidence, and surfacing it as
"PipelineStoppedException" would read like an engine fault.

### Sleeps are the one hole Tick cannot cover

A sleep happens _inside_ a statement, so no amount of per-statement checking
interrupts it. Measured before the fix: `Start-Sleep -Seconds 3` really did
take 3 seconds, and `-Seconds 600` would have frozen the tab for ten minutes
with no way out but killing it — losing every IOC captured up to that point.

Two routes, both now capped at `SleepCapMilliseconds` (100 ms by default):

|                                     | before | after                            |
| ----------------------------------- | ------ | -------------------------------- |
| `Start-Sleep -Seconds 600`          | 600 s  | 131 ms                           |
| `[Threading.Thread]::Sleep(600000)` | 600 s  | 55 ms                            |
| `Start-Sleep -Milliseconds 50`      | 50 ms  | 70 ms (under the cap, untouched) |

The .NET route is refused at the binder: `System.Threading.*` joins the
classification table as `timing.sleep`, and only the members that actually
block (`Sleep`, `Delay`, `Wait`, `SpinWait`, …) are classified, because Thread
and Task have plenty that do not.

The cmdlet route is **clamped, not skipped**. `HuskHostHook.ClampCmdlet`
rewrites `Start-Sleep`'s bound `Seconds`/`Milliseconds`/`Duration` property
before `BeginProcessing`, from `CommandProcessorBase` — so a sample cannot
reach around it the way it could delete a proxy function. Skipping the cmdlet
outright was the wrong lever: `IsBlocked` also covers `registry.*`, and the
virtual registry provider very much does need to run.

**This is visible to a sample that times itself**, and that is a trade rather
than something Husk can avoid. A sample that measures its own sleep sees 131
milliseconds where it asked for ten minutes and may bail. The alternative is
an analyst with a frozen tab. Both routes are recorded, so the report says the
sample asked to sleep for 600 seconds and that Husk did not.

### Cost

None measurable. `Tick()` is a latch test, an increment and a compare, with
the clock read once every 1024 statements. The corpus run is unchanged at 6 s
and 39 s for 244 and 864 fixtures, and recovery is unchanged at 97.5% and
100.0%.

## Remaining work, in order

Each item says why it matters, what "done" looks like, and what is already
known about it. Anything marked **blocking** gates a decision rather than a
feature.

### 0. Proxy the filesystem and registry cmdlets — DONE, differently

The entry asked for proxy functions. Cmdlet-level capture plus a registry
provider covers the same ground without them, and without the bypass a proxy
carries: a sample can delete a function, not a provider or the command
processor. See the two sections above.

### 1. Commands.Management — DONE

Built and injected; see "Commands.Management — built, and it corrected the
layer model" above for what it changed. The `Set-ItemProperty` half of "done
when" is still open and carries on as item 2.

<details><summary>Original entry</summary>

**Why:** `Remove-Item`, `Set-ItemProperty`, `New-ItemProperty`, the registry
provider, `Get-ChildItem`. Registry persistence is a top-three commodity
behaviour and is currently invisible except through the WScript.Shell fake.
Also needed to test the "sample deletes the proxy" case, which is the one
bypass still unproven.

**Done when:** `Remove-Item function:New-Object` works, and
`Set-ItemProperty HKCU:\...\Run` is captured as `registry.write`.

**Known:** same build recipe as Utility. Expect more platform guards —
Management touches the filesystem and registry providers hardest, so it is the
likeliest place to hit the next `PlatformNotSupportedException`. Build it
_alone_ and take SMA from its output, same as Utility, to keep versions
consistent.

</details>

### 2. Registry and process classification — DONE

Done: Run-key persistence and `Start-Process` both produce the right op with
the command line, from three layers rather than one, and the virtual registry
means they _succeed_ instead of aborting the sample. See "Cmdlet-level
capture" and "The virtual registry" above, and the table measured there.

What is still open from this item:

- **`Copy-Item` / `Move-Item` / `Rename-Item` on a registry path.** Classified
  (`registry.write`) but not implemented in the provider; the base class
  throws. Rare in samples, so it is listed rather than built.
- **Value types.** The provider stores whatever it is handed. A sample that
  writes a `REG_BINARY` and reads back expecting a `byte[]` gets the object it
  wrote, which is right by accident rather than by design. `RegistryValueKind`
  is not modelled.
- **No registry ACLs, no `Get-Acl`.** A sample that checks whether it can
  write to `HKLM` gets no answer.

### 3. Corpus measurement — DONE, and the fork is worth carrying

**The numbers**, `scripts/husk/wasm-spike/measure.mjs` against all 1,108
fixtures, 45 seconds of wall clock:

|                        | tree-walker | engine     |
| ---------------------- | ----------- | ---------- |
| single-transform (244) | 80.7%       | **98.0%**  |
| layered (864)          | 50.2%       | **100.0%** |

Five fixtures miss, all in single-transform, and **not one of them for a reason
patching PowerShell can fix**:

- **4× `Cannot find an overload for "StructureToPtr"`** and friends
  (`GetLastPInvokeError`, `DestroyStructure`). These are
  `Out-SecureStringCommand` samples, and they pick the method to call by
  **indexing into reflection**:
  `[Marshal]::([Marshal].GetMembers()[4].Name).Invoke(…)`. The member order of
  `System.Runtime.InteropServices.Marshal` is not the same in .NET 8 as in .NET
  Framework 4.8, and the sets are not even the same — `GetLastPInvokeError`
  does not exist in 4.8 at all. Index 4 meant one method there and means
  another here.

  There is no faithful fix. The sample depends on the _framework build_ rather
  than on PowerShell, so it would fail the same way on real PowerShell 7 on
  Windows; reproducing 4.8's member order would mean carrying 4.8's member
  list, which the fork cannot derive. This is the honest ceiling of the
  approach, and it is worth knowing where it is.

- **1× corpus defect, not an engine gap.** `all-token-types/string-3` obfuscates
  a _multi-line_ script through `-join [regex]::Matches($s, '.', 'RightToLeft')`.
  A bare `.` never matches a newline, so the technique drops them, the recovered
  script becomes one line, and its leading `#` comments the whole thing out.
  Measured in the engine: `(-join [regex]::Matches("a`nb", ".", "RightToLeft")).Length`is 2. No PowerShell can reproduce that fixture's own`expected`from its own`obfuscated`. Deobfuscation itself succeeded — the recovered layer is
  byte-identical to the ground truth.

So the honest engine figure is **239/239 measurable single-transform cases and
864/864 layered** — every fixture whose obfuscated form can reproduce its own
expected output anywhere other than Windows PowerShell 5.1 on .NET Framework
4.8.

### The metric had to change, and that is the finding

The first four measurement passes read 2.0%, 6.6%, 11.5% and 11.5%. Every one
of those numbers was mostly wrong, and not because of the engine.

`expected` in the corpus is the **deobfuscated source text**. That is the right
ground truth for a tree-walker, which produces source. The engine produces
_behaviour_: run `&("{1}{0}"-f 'rite-Host','W') "hi"` and you get `hi`, never
the string `Write-Host "hi"`. Comparing the engine's output to `expected`
scores a correct execution as a failure, which is what 179 of the "no-match"
results were.

So `measure.mjs` reports two metrics:

- **behaviour reproduced** — run the obfuscated sample, run the fixture's
  ground-truth script through the same engine, compare. Like-for-like, and it
  is the metric that matters for IOC extraction: a sample's effects, not its
  spelling.
- **source recovered** — did a layer handed to `Invoke-Expression` equal the
  deobfuscated source? This is the tree-walker's metric. The engine scores
  22.1%/57.1% on it, and _should_ score low: it only sees a layer where the
  sample routes through `IEX`, and most single-transform cases do not.

Two further harness-level corrections, both of which were counted as engine
failures at first:

- 768 of 864 layered fixtures and most single-transform ones are
  `powershell "<script>"` **launcher command lines**, not scripts. The harness
  unwraps the switches and `-EncodedCommand`.
- those command lines carry **cmd.exe escaping** — `\"` for a quote, `^|` for a
  pipe. Handing the engine literal backslashes produced a command named `\[\`.
  **5 fixtures.** This belongs in the product: Husk's ingest needs a launcher
  parser, and that parser needs cmd's escaping rules.

### 4. Harden the capture surface — DONE, and it was worse than forgery

The entry worried about a sample injecting fake records. The measured reality
was that **a sample could disarm the sandbox in three lines**:

```powershell
[System.Management.Automation.HuskHostHook]::BlockNetwork = $false
[System.Management.Automation.HuskHostHook]::OnHostCall = $null
[System.Management.Automation.HuskHostHook]::SetBudget(0, 0)
```

All three worked. The unqualified `[HuskHostHook]` not resolving looked like
protection and was not — the namespace-qualified name resolved fine. A sample
could also raise the sleep cap, forge a `binder`-sourced record through the
public `HuskHost.RecordFrom`, and — worst — call `[HuskHost]::Drain()`, which
returned the records _and emptied them_. Erasing the evidence is the only one
of these that costs the analyst something irrecoverable.

Closed, in two ways:

**The engine's configuration is write-once.** The host calls
`HuskHostHook.Seal()` at the end of `Init` and keeps the key it returns;
`SetSinks`, `SetBlockNetwork`, `SetBudget`, `SetSleepCap` and `BeginRun` all
require that key afterwards. `Seal()` is callable once, so a sample cannot
re-seal with a key of its own. The fields became properties with private
setters, so there is no assignable surface left.

**The evidence is host-only.** `RecordFrom`, `Drain`, `TakeLayers` and the JSON
helper are `internal` in the spike assembly, so script cannot find them at all.
`Record` and `RecordLayer` stay public because the proxies are PowerShell
script and have to reach them — and `Record` hard-codes the source `proxy`, so
a forged record is labelled as coming from the one layer an analyst should
already treat as least trustworthy. The source label is the thing a record must
not be able to lie about.

**A refused attempt is recorded as `evasion.sandbox`.** Nothing but a sample
looking for a sandbox tries to turn one off, so the attempt is worth more to
the analyst than the setting it failed to change. The op is new in
`src/features/husk/host/ops.ts`, and it is the odd one out there: it is not
something a sample does to a machine, it is something it does to Husk.

Measured, `probes/host-calls.ps1`:

| attempt                     | result                                         |
| --------------------------- | ---------------------------------------------- |
| `SetBlockNetwork($false)`   | refused, `BlockNetwork` still `True`, recorded |
| `SetSinks($null, $null)`    | refused, capture still wired, recorded         |
| `SetBudget(0, 0)`           | refused, recorded                              |
| `SetSleepCap(600000)`       | refused, cap still 100, recorded               |
| `Seal()` again              | returns `$null`; cannot re-seal                |
| `[HuskHost]::RecordFrom(…)` | not found                                      |
| `[HuskHost]::Drain()`       | not found                                      |
| a file write afterwards     | still captured                                 |

**This is a bar, not a wall, and the distinction matters.** A sample willing to
use reflection can still reach a private static, and nothing inside the same
process can stop that. What makes Husk trustworthy is the boundary _outside_
the CLR — the `fetch` hook in JavaScript, which .NET cannot reach around, and
the fact that there is no real machine behind any of this. The seal turns a
three-line disarm into something that takes deliberate reflection and leaves a
record either way.

**Still open:** `HuskHost.Record` and `RecordLayer` remain script-reachable, so
a sample can still add noise to the `proxy` layer. Closing that means moving
the proxy functions into C# cmdlets, which is a bigger change than it looks —
`Invoke-WebRequest`'s parameter set alone is substantial — and it buys less
than the two fixes above.

### 5. Perf check on the binder wrapper and the budget tick

**Why:** `InvokeMethod` is wrapped on every bind. The namespace fast-path
should make it free, but that is asserted rather than measured.

**Done when:** a benchmark script shows bind-heavy code is not measurably
slower than stock SMA.

### 6. Trimming — DONE, 26.63 MB → 15.95 MB

Measured properly this time, by rebuilding both ways and gzipping every file
the server would send. The earlier "~12 MB" in this log was taken before
Commands.Management and Security joined the bundle and is not comparable.

| | gzipped | assemblies |
|---|---|---|
| before | 26.63 MB | 199 |
| after | **15.95 MB** | 196 |

Two changes, and **no corpus movement**: 98.0% / 100.0% either way, with 219
live cmdlets instead of 220 — the one lost being `Add-Type`.

**Roslyn, 10.6 MB gzipped, was 40% of the bundle and bought nothing.** It is
there for `Add-Type`, and `Add-Type` cannot work in a browser: with Roslyn
present the cmdlet's own type initializer throws `TypeInitializationException`
on wasm. The capability was already absent; only the download was real.

Removing the *package reference* is not enough — the file has to go. Husk
registers cmdlets with `Assembly.GetTypes()`, which throws whole if any type
fails to resolve, and **mono's `ReflectionTypeLoadException.Types` comes back
with most of the assembly missing**: tolerating the exception and taking the
non-null types dropped Utility from 220 live cmdlets to **105**. So the
Utility csproj excludes `commands/utility/AddType.cs` for `browser-wasm`, and
a proxy function records the C# source and the P/Invoke imports the sample
declared — which is the evidence an analyst wants, since the imports name the
Windows API the sample intended to call and there is no native library behind
them here anyway.

**`SMA-unix.dll` was being downloaded twice.** The app references the patched
SMA by file name, so the wasm SDK bundles it under that name while the
injection step writes it under its assembly name; both landed in
`blazor.boot.json`. 2 MB, for nothing.

`Microsoft.ApplicationInsights` has to stay, though telemetry is opted out:
SMA holds a static field of a type from it, and the field's type must load for
the class to initialise. Measured by removing it — `Init` failed with "could
not load type of field …`<s_telemetryClient>k__BackingField`".

**Stopped here deliberately.** The next tranche — Markdig, JsonSchema.Net,
System.Drawing.Common and its `System.Private.Windows.Core` — is 1.76 MB for
four more csproj exclusions and the compile errors that follow from the files
that reference them. 11% of the bundle for an afternoon, and it changes no
decision. What is left is mostly irreducible without ILLink, and
`PublishTrimmed` on SMA is the documented hazard: it is reflection-heavy and
trimming it breaks it quietly.

The honest framing for 16 MB: it is a once-per-browser download, cached, for a
tool that replaces a VM, and the tree-walker still serves the first paint and
the `file://` case. The engine has to be a lazy import, not a page weight.

### 7. Integrate with Husk proper — **the next thing to do**

**Why:** everything about the engine is still a standalone spike under
`scripts/husk/wasm-spike/`. None of it is wired to `analyze.ts`, the trace, the
gap ledger or the UI, so an analyst cannot use any of it. The launcher parser
(item 10) is the first piece that landed in the product.

**Done when:** the engine is a `Frontend` behind the interface in
`husk-sandbox-spec.md` §6, emitting the same canonical ops, so the existing IOC
extraction and reporting work unchanged.

**The decision from item 3 has landed:** the engine wins, 98.0%/100.0% against
80.7%/50.2%, so it becomes the default backend. The tree-walker stays for the
`file://` single-file case, which the engine cannot serve — ES-module CORS — and
for the first paint, since the engine costs ~12 MB and ~1.5 s of boot.

**Known, and in rough order:**

1. The four capture sources (`binder`, `cmdlet`, `provider`, `proxy`) have to
   become `TraceEvent`s. The op vocabulary already matches `host/ops.ts`; the
   source label is new and the UI should show it, because the layers differ in
   how much they can be trusted.
2. The registry dump and the dropped-file list are new artefacts with no home
   in the current result shape.
3. A budget stop is a *partial* result, not an error, and `AnalysisResult` has
   no way to say that today.
4. The 12 MB bundle must be lazy: nobody pays for it until they ask for the
   engine.
5. `measure.mjs`'s copy of the launcher unwrapping goes away once the engine
   reads the TypeScript parser.

### 8. Licensing and attribution — DONE

The fork is recorded in `THIRD-PARTY.md` and `docs/licenses/husk-manifest.json`,
with the pin, the patched file list and the build recipe, and a test ties the
two together. The built assemblies do not ship yet; what has to be added on the
day they do is written down there.

<details><summary>Original entry</summary>

**Why:** this vendors a patched PowerShell. PowerShell is MIT, so the fork is
permitted, but the notice has to travel: `THIRD-PARTY.md` currently records
only the lexer-table port.

**Done when:** `THIRD-PARTY.md` names the PowerShell fork, its upstream
commit, the patch series and Microsoft's copyright, and the licence tests
cover it the way they cover the lexer tables.

</details>

### 9. Managed AES — DONE

`src/System.Management.Automation/security/HuskAes.cs` in the fork: AES-CBC
with PKCS7, as an `ICryptoTransform`, so `SecureStringHelper`'s `CryptoStream`
plumbing is unchanged. `ConvertTo-SecureString -Key` now round-trips in the
browser, and the corpus moved from 97.5% to 98.0%.

Why it had to be written rather than configured: .NET's browser cryptography is
SubtleCrypto, which is asynchronous only, and with threads off there is nothing
to block on. `Aes.Create()` _succeeds_ — it was `CreateDecryptor` that threw,
from `AesImplementation.CreateTransformCore`. There is no switch.

It is a straight FIPS-197 implementation: no T-tables, no unrolling. It
decrypts a few hundred bytes of payload, so being obviously correct matters and
being fast does not. It is **not constant-time and must not be used to protect
anything**; it exists to read what a sample was hiding, and the sample already
knows its own key. The S-box is generated rather than transcribed, because
generating it cannot go wrong the way typing 256 hex bytes can.

**Hand-written crypto is only as good as its test.**
`scripts/husk/wasm-spike/aes-vectors/` runs on ordinary Linux .NET, where the
real AES works, and checks the managed one against the FIPS-197 appendix C
known-answer vectors for all three key sizes plus 147 comparisons with
`System.Security.Cryptography.Aes` over every plaintext length from 0 to 48
bytes, through the same `CryptoStream` plumbing.

That last part is what caught the actual bug, and it is worth recording because
the name is misleading: **`CryptoStream` does not reserve the final block for
`TransformFinalBlock`.** It feeds everything through `TransformBlock` and then
calls `TransformFinalBlock` with nothing, so a padded decryptor has to hold the
last block back itself. Without that, every round trip came back with its PKCS7
bytes still attached — and the first version of this file did exactly that, on
147 of 147 cases.

### 10. A launcher parser in the product — DONE, with a limit found

`src/features/husk/eval/launcher.ts`, with 16 tests. It takes a command line,
resolves the abbreviated switches droppers actually use (`-nop`, `-w hidden`,
`-ep bypass`, `-noni`, `/c`), decodes `-EncodedCommand` as UTF-16LE, strips one
layer of quoting and undoes cmd.exe's escaping, and reports every switch it
saw. `analyze()` returns the parse and a one-line summary.

Two things worth recording.

**`-e` is EncodedCommand and `-ep` is ExecutionPolicy**, even though both start
with an e. Plain prefix matching gets that wrong, so the switch table is
ordered and the handful of spellings the real parser treats specially are
listed outright. An unrecognised switch is reported rather than dropped: it may
be the thing that explains why the sample behaved differently than the report
says.

**It is not a pipeline recipe, and that was measured rather than assumed.**
Adding it to the tree-walker's recipe list left the coverage floors intact but
took the layered corpus from 16 silent failures to **107** — fixtures that fail
*without recording a gap*, which is the one thing Husk promises not to do. The
tree-walker's own recipes were written to see whole command lines, and
introducing a layer boundary ahead of them broke that. So the parser is for the
engine's ingest path and for the report; the tree-walker keeps the recipes it
has.

**Still duplicated:** `measure.mjs` carries its own copy of the unwrapping,
because it is a `.mjs` build-time harness and cannot import the TypeScript. The
two have to stay in step until the engine lands in the product, at which point
the TypeScript is the only copy.

### Known gaps not yet scheduled

- `file://` cannot work (ES module CORS). The tree-walker keeps that property.
- WebClient and the web cmdlets are proxied, not implemented; a sample that
  inspects the returned object closely will notice.
- A sample that times its own sleep can tell it was clamped. See "Sleeps are
  the one hole Tick cannot cover" — the trade is deliberate.
- Threads are off. If anything later needs them, it costs COOP/COEP and
  therefore static hosting.
- The 5.1 fidelity patches are a _partial_ emulation of .NET Framework
  behaviour, chosen because the corpus showed those three points mattered.
  There will be others. Each one found this way is a patch, not a setting;
  there is no switch in PowerShell for "behave like 5.1".
- The alias table in `Program.cs` is the 5.1 default set, typed out by hand
  because registering cmdlets off an assembly gets the cmdlets but not the
  aliases a module manifest would have declared. 15 fixtures failed on a
  missing `ls` alone. It is a table, so adding to it is cheap, but it is not
  derived from anything and will drift.
