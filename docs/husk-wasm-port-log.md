# Porting PowerShell to browser-wasm: working log

**Status:** **real PowerShell deobfuscates in a browser.**
`IEX ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(...)))`
returns the decoded stage, and `&('I'+'E'+'X')` resolves. 162 cmdlets live.
Runs on **ordinary static hosting** — no cross-origin isolation headers.
`file://` does not work, for an unrelated loader reason.

Four real source patches, 52 insertions across 7 files.

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

| | |
|---|---|
| Runtime boot | 0.9–1.1 s |
| Assemblies registered | 183 |
| SMA managed IL | loads — mono-wasm does not reject it |
| Bundle | 31 MB raw, **11.26 MB gzipped** |

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

### 3. `TypeInitializationException` — `Tracing.PSSysLogProvider` — CURRENT BLOCKER
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
correct *if* Husk ever moves behind a server that sets COOP/COEP.

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
port is **52 insertions across 7 files**. Apply to a clean `v7.4.6` checkout.

Two are environment-only, needed because of this network policy:

1. `global.json` — SDK pin 8.0.403 → installed 8.0.131 with `rollForward`.
2. `nuget.config` — PowerShell's private Azure feed is blocked; nuget.org has
   everything the SMA project references.
3. `PSVersionInfoGenerator.csproj` — Roslyn 4.9.2 → 4.8.0, because SDK 8.0.131
   ships the 4.8 compiler and the newer SDK is not installable here.

Three are real port patches, each guarding a platform assumption:

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

## Measured, with all patches applied

| | |
|---|---|
| Boot | ~0.95 s |
| `Runspace.Open()` | 589 ms |
| Bundle | 12.30 MB gzipped |
| SMA | 6.38 MB |

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

| | |
|---|---|
| Boot | ~1.5 s |
| `Runspace.Open()` | 582 ms |
| Cmdlets | 115 registered, 162 live |
| Assemblies | 196 |

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
internally, which is unsupported single-threaded, so they throw *before*
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
on wasm anyway. **Telemetry does not**: a bypass produces *silence* rather than
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
in `CoreAdapter.cs` looks like the chokepoint, and it is — for the *interpreted*
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

Arguments come through resolved, not as source text — the written *content* is
captured alongside the path, and a byte array renders as `<byte[2]>` rather
than being dumped.

**Not proven:** the test also tried `Remove-Item function:New-Object` to delete
the proxies first, and that silently failed because `Remove-Item` lives in
Commands.Management, which is not built. The calls above bypass proxies by
construction, so the result stands, but the explicit deletion case is untested.

### Three layers now

| Layer | Sees | Bypassable |
|---|---|---|
| Proxy functions | cmdlet/COM cradles, rich arguments | yes |
| **Binder hook** | **every .NET method call** | **no, from script** |
| `fetch` boundary | anything reaching HTTP | no |

Filesystem calls are deliberately *not* blocked — letting a sample drop its
payload into the in-memory filesystem is how the analyst extracts it
afterwards. Network is refused at the binder, so the sample sees a null rather
than an exception.

## Next

- **Commands.Management** — `Remove-Item`, `Set-ItemProperty` and the registry
  provider; also needed to test proxy deletion properly.
- **Registry and process** classification beyond the WScript.Shell fakes.
- **Corpus measurement** against the 244 + 864 fixtures.
- **Perf check.** The binder wrapper runs on every bind; the namespace
  fast-path should make it free, but that is asserted, not measured.
- **Trimming.** 197 assemblies, ~12 MB gzipped.
