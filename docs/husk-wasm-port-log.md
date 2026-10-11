# Porting PowerShell to browser-wasm: working log

**Status:** stopped. The runtime boots and SMA loads, but PowerShell cannot
execute on single-threaded wasm, and the multi-threaded alternative requires
cross-origin isolation headers that static hosting cannot send. See
**Threading** below — that is the finding, the rest is how it was reached.

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

## Threading: tested, and it ends the default approach

Probed in the browser before spending time on source patches, because it was
the cheapest thing that could invalidate them. It did.

```
ProcessorCount   = 1
IsBrowser        = True
Thread.Start     = PlatformNotSupportedException
Task.Run + Wait  = timeout            <- the fatal one
blockingWait     = returned-false
```

`Task.Run(...).Wait()` timing out is the finding that matters. On
single-threaded wasm the continuation is queued to the same thread, so a
blocking wait can never be satisfied: every synchronous-over-async pattern
deadlocks.

`PowerShell.Invoke()` is precisely that pattern — it blocks the caller while
the pipeline completes, and `Runspace.Open()` uses wait handles the same way.
`PSThreadOptions.UseCurrentThread` moves the pipeline onto the calling thread
but does not remove the internal waits.

This is not a patch to `Utils.GetApplicationBase` or `PSSysLogProvider`. It is
PowerShell's execution model assuming it can block one thread while work
proceeds on another. Making SMA run single-threaded means making it async
throughout, which is a rewrite of its core rather than a fork patch.

### The one way around it, and what it costs

.NET supports multi-threaded wasm (`WasmEnableThreads`), which needs
`SharedArrayBuffer`, which needs COOP/COEP cross-origin isolation headers.

- **GitHub Pages cannot send those headers.** Already documented in the README
  for Glass, and it is why Glass does not request wasm threads either.
- **A downloaded `file://` copy certainly cannot.** That property — Dead Letter
  and Husk running from an analyst's disk with no server — is load-bearing for
  this project.

So the engine route is available only by giving up static hosting and running
Husk behind a server that sets those headers, on top of a PowerShell fork and
experimental wasm threading. That is a different product, not a different
build flag.

**Untested beyond this point**, and only worth testing if the hosting model
changes: whether `WasmEnableThreads=true` actually builds with SMA, and
whether the remaining blockers are patchable once threads exist.
- **Reflection.Emit.** SMA compiles script via the DLR to `Expression.Compile()`.
  Works in mono's interpreter, not AOT. Keep AOT off.
- **Fork maintenance.** Whatever lands here is a PowerShell fork to carry
  against upstream indefinitely.

## Files

- `scripts/husk/wasm-spike/` — csproj, `Program.cs`, `main.js`, `rebuild.sh`
- `docs/husk-spec.md` §1 — the decision and measurements
- `docs/husk-sandbox-spec.md` — the virtual host this engine would feed
