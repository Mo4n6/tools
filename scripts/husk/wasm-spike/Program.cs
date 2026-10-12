using System;
using System.IO;
using System.Linq;
using System.Management.Automation;
using System.Management.Automation.Host;
using System.Management.Automation.Runspaces;
using System.Reflection;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Runtime.InteropServices.JavaScript;


/// Reachable from PowerShell as [HuskHost]::Record(...), which is how the
/// proxy functions report. Public and static by necessity: a script has to be
/// able to call it, and anything a script can call is also something a sample
/// could call to forge entries. Forged entries are harmless here - they add
/// noise to a log the analyst reads, they do not grant any capability - but
/// the trace should say where a record came from before this ships.
public static class HuskHost
{
    private static readonly List<string> s_calls = new();
    private static int s_seq;

    /// Public because the proxy functions are PowerShell script. A sample can
    /// call it and inject a record, which adds noise rather than removing
    /// evidence, and the source is always "proxy" - the layer whose records an
    /// analyst should already treat as the least trustworthy. Closing this
    /// properly means moving the proxies into C# cmdlets; see the port log.
    public static void Record(string op, string nativeSignature, string[] args)
        => RecordFrom("proxy", op, nativeSignature, args);

    /// Internal: the source label is the one thing a record must not be able
    /// to lie about. `Record` below is public because the proxy functions are
    /// PowerShell and have to reach it, and it hard-codes "proxy" - so a
    /// forged record is labelled as coming from the one layer that is already
    /// known to be forgeable. Letting script pass its own source let a sample
    /// forge a "binder" record, which is evidence an analyst would trust.
    internal static void RecordFrom(string source, string op, string nativeSignature, string[] args)
    {
        var quoted = string.Join(",", (args ?? Array.Empty<string>()).Select(JsonQuote));
        lock (s_calls)
        {
            s_calls.Add(
                $"{{\"seq\":{s_seq++},\"op\":{JsonQuote(op)}," +
                $"\"native\":{JsonQuote(nativeSignature)},\"args\":[{quoted}],\"source\":{JsonQuote(source)}}}");
        }
    }

    private static readonly List<string> s_layers = new();

    public static void RecordLayer(string text)
    {
        lock (s_layers) { s_layers.Add(text ?? ""); }
    }

    internal static string[] TakeLayers()
    {
        lock (s_layers)
        {
            var copy = s_layers.ToArray();
            s_layers.Clear();
            return copy;
        }
    }

    /// Internal: a sample called `[HuskHost]::Drain()` and the records came
    /// back to it, emptied. Erasing the evidence is the one attack that
    /// actually costs the analyst something, so this is host-only.
    internal static string Drain()
    {
        // Really drains. A report belongs to one sample, and leaving records
        // behind made every run in a batch inherit the previous one's IOCs.
        lock (s_calls)
        {
            var json = "[" + string.Join(",", s_calls) + "]";
            s_calls.Clear();
            return json;
        }
    }

    internal static string JsonQuotePublic(string value) => JsonQuote(value);

    private static string JsonQuote(string value)
    {
        value ??= "";
        var sb = new StringBuilder("\"");
        foreach (var c in value)
        {
            if (c == '"' || c == '\\') { sb.Append('\\').Append(c); }
            else if (c < ' ') { sb.Append("\\u").Append(((int)c).ToString("x4")); }
            else { sb.Append(c); }
        }

        return sb.Append('"').ToString();
    }
}


/// A PSHost that captures instead of writing to a terminal.
///
/// The default console host P/Invokes libpsl-native for terminal handling, so
/// in a browser every Write-Host throws DllNotFoundException - and Write-Host
/// is the payload in most obfuscated samples. Capturing is also what an
/// analyst wants: the text a sample tried to print is evidence.
public sealed class HuskHostUi : PSHostUserInterface
{
    private readonly StringBuilder _out = new();

    public string Drain()
    {
        lock (_out) { var s = _out.ToString(); _out.Clear(); return s; }
    }

    private void Append(string value)
    {
        lock (_out) { _out.Append(value); }
    }

    public override PSHostRawUserInterface RawUI => null;

    public override void Write(string value) => Append(value);

    public override void Write(ConsoleColor foregroundColor, ConsoleColor backgroundColor, string value)
        => Append(value);

    public override void WriteLine(string value) => Append(value + "\n");

    public override void WriteLine() => Append("\n");

    public override void WriteErrorLine(string value) => Append(value + "\n");

    public override void WriteDebugLine(string message) => Append(message + "\n");

    public override void WriteVerboseLine(string message) => Append(message + "\n");

    public override void WriteWarningLine(string message) => Append(message + "\n");

    public override void WriteProgress(long sourceId, ProgressRecord record) { }

    // A sample that prompts gets an empty answer rather than a hang. Blocking
    // for input would stall the tab with no one to type into it.
    public override string ReadLine() => string.Empty;

    public override System.Security.SecureString ReadLineAsSecureString()
        => new System.Security.SecureString();

    public override Dictionary<string, PSObject> Prompt(
        string caption, string message, System.Collections.ObjectModel.Collection<FieldDescription> descriptions)
        => new();

    public override int PromptForChoice(
        string caption, string message,
        System.Collections.ObjectModel.Collection<ChoiceDescription> choices, int defaultChoice)
        => defaultChoice;

    public override PSCredential PromptForCredential(
        string caption, string message, string userName, string targetName)
        => null;

    public override PSCredential PromptForCredential(
        string caption, string message, string userName, string targetName,
        PSCredentialTypes allowedCredentialTypes, PSCredentialUIOptions options)
        => null;
}

public sealed class HuskPSHost : PSHost
{
    private readonly Guid _id = Guid.NewGuid();

    public HuskHostUi Ui { get; } = new();

    public override string Name => "Husk";

    public override Version Version => new(1, 0);

    public override Guid InstanceId => _id;

    public override PSHostUserInterface UI => Ui;

    public override System.Globalization.CultureInfo CurrentCulture
        => System.Globalization.CultureInfo.InvariantCulture;

    public override System.Globalization.CultureInfo CurrentUICulture
        => System.Globalization.CultureInfo.InvariantCulture;

    public override void SetShouldExit(int exitCode) { }

    public override void EnterNestedPrompt() { }

    public override void ExitNestedPrompt() { }

    public override void NotifyBeginApplication() { }

    public override void NotifyEndApplication() { }
}

public static partial class Spike
{
    private static Runspace? _rs;
    private static HuskPSHost? _host;
    private static int _cmdletCount;
    private static int _aliasCount;

    /// What the wasm runtime actually reports for the paths SMA derives
    /// $PSHOME from. Guessing at these cost two build cycles.
    [JSExport]
    internal static string EnvProbe()
    {
        var loc = typeof(System.Management.Automation.PSObject).Assembly.Location;
        return string.Join(" | ", new[]
        {
            "SMA.Location=" + (loc.Length == 0 ? "(empty)" : loc),
            "AppContext.BaseDirectory=" + (AppContext.BaseDirectory ?? "(null)"),
            "ProcessPath=" + (Environment.ProcessPath ?? "(null)"),
            "CurrentDirectory=" + Environment.CurrentDirectory,
        });
    }

    /// Where the fake C: drive lives in the in-memory filesystem.
    private const string CDriveRoot = "/husk-c";

    /// A real PowerShell drive, so `C:\Users\Public\x.exe` resolves the way
    /// a sample expects instead of being read as a relative Unix path. The
    /// .NET APIs do not go through PowerShell drives, so
    /// [IO.File]::WriteAllText("C:\...") still lands on a literal filename -
    /// captured either way, since the dropped-file walker reads the whole
    /// virtual root.
    private const string CDrive =
        "New-PSDrive -Name C -PSProvider FileSystem -Root '" + CDriveRoot + "' " +
        "-Scope Global | Out-Null";

    [JSExport]
    internal static string Init()
    {
        try
        {
            // SMA derives $PSHOME from the application base, which on wasm
            // resolves through Environment.ProcessPath - null in a browser -
            // and lands in Path.Combine(null, ...). Give it a real directory
            // in the in-memory filesystem before anything touches it.
            const string home = "/pshome";
            Directory.CreateDirectory(home);
            Directory.CreateDirectory(Path.Combine(home, "Modules"));
            AppDomain.CurrentDomain.SetData("APP_CONTEXT_BASE_DIRECTORY", home);
            Environment.SetEnvironmentVariable("PSModulePath", Path.Combine(home, "Modules"));
            Environment.SetEnvironmentVariable("POWERSHELL_TELEMETRY_OPTOUT", "1");

            // A Windows-shaped tree behind a C: drive.
            //
            // Without it `Out-File C:\Users\Public\x.txt` fails with "could
            // not find a part of the path /C/Users/Public/x.txt": the Unix
            // FileSystemProvider has one root, so a Windows path becomes a
            // relative one and the directories do not exist. Every filesystem
            // cmdlet a dropper uses dies there, before dropping anything.
            //
            // The directories are the ones samples actually write to. An
            // analyst's extraction is only as good as the writes that
            // succeeded, so a missing directory is a lost payload.
            Directory.CreateDirectory(CDriveRoot);
            foreach (var dir in new[]
            {
                @"Users\Public", @"Users\Public\Documents",
                @"Users\analyst\AppData\Roaming",
                @"Users\analyst\AppData\Local\Temp",
                @"Users\analyst\Desktop", @"Users\analyst\Downloads",
                @"Users\analyst\Start Menu\Programs\Startup",
                @"Windows\Temp", @"Windows\System32", @"Windows\Tasks",
                @"ProgramData", @"Program Files", @"Program Files (x86)",
            })
            {
                Directory.CreateDirectory(
                    Path.Combine(CDriveRoot, dir.Replace('\\', Path.DirectorySeparatorChar)));
            }

            // A browser has no Windows environment, and obfuscators lean on it
            // hard: $env:ComSpec[4,15,25] and friends are a standard way to
            // rebuild "IEX" without writing it. An empty value turns into
            // "Cannot index into a null array" and the sample dies there.
            //
            // These are the analyst-editable host constants husk-spec.md section 5
            // describes; the values are plausible defaults, not real ones.
            foreach (var (key, value) in new[]
            {
                ("ComSpec", @"C:\Windows\system32\cmd.exe"),
                ("COMPUTERNAME", "DESKTOP-HUSK01"),
                ("USERNAME", "analyst"),
                ("USERDOMAIN", "WORKGROUP"),
                ("USERPROFILE", @"C:\Users\analyst"),
                ("HOMEDRIVE", "C:"),
                ("HOMEPATH", @"\Users\analyst"),
                ("APPDATA", @"C:\Users\analyst\AppData\Roaming"),
                ("LOCALAPPDATA", @"C:\Users\analyst\AppData\Local"),
                ("TEMP", @"C:\Users\analyst\AppData\Local\Temp"),
                ("TMP", @"C:\Users\analyst\AppData\Local\Temp"),
                ("ALLUSERSPROFILE", @"C:\ProgramData"),
                ("PUBLIC", @"C:\Users\Public"),
                ("ProgramData", @"C:\ProgramData"),
                ("ProgramFiles", @"C:\Program Files"),
                ("CommonProgramFiles", @"C:\Program Files\Common Files"),
                ("SystemRoot", @"C:\Windows"),
                ("SystemDrive", "C:"),
                ("windir", @"C:\Windows"),
                ("OS", "Windows_NT"),
                ("PATHEXT", ".COM;.EXE;.BAT;.CMD;.VBS;.JS;.WSF;.PS1"),
                ("PROCESSOR_ARCHITECTURE", "AMD64"),
                ("NUMBER_OF_PROCESSORS", "4"),
                ("PSModulePath", @"C:\Program Files\WindowsPowerShell\Modules"),
            })
            {
                Environment.SetEnvironmentVariable(key, value);
            }

            // CreateDefault2 loads only Microsoft.PowerShell.Core, so SMA does
            // not go looking for modules on a filesystem that is not there.
            // CreateDefault2 imports the core snap-in, which reads $PSHOME
            // from Assembly.Location - empty on wasm. An empty session state
            // skips that entirely; the language engine is what deobfuscation
            // needs, not the cmdlet surface.
            // With $PSHOME resolving, try the real thing: CreateDefault2
            // imports Microsoft.PowerShell.Core, which is where IEX lives.
            var iss = InitialSessionState.CreateDefault2();
            iss.ThreadOptions = PSThreadOptions.UseCurrentThread;

            // $PSHOME is "/" with no module layout under it, so the usual
            // discovery finds no cmdlets. Register them straight off the
            // assembly instead: every [Cmdlet]-attributed type in
            // Commands.Utility, which is where Invoke-Expression lives.
            // Loaded by name rather than referenced at compile time: the
            // compile-time identity would have to match the runtime one
            // exactly, and pinning both across two builds is more fragile
            // than just asking the runtime for it.
            // Each is optional: a build that ships only Utility should still
            // start, with fewer cmdlets, rather than failing to initialise.
            foreach (var name in new[]
            {
                "Microsoft.PowerShell.Commands.Utility",
                "Microsoft.PowerShell.Commands.Management",
                "Microsoft.PowerShell.Security",
            })
            {
                try { _cmdletCount += RegisterCmdlets(iss, Assembly.Load(name)); }
                catch (Exception) { /* not in this bundle; carry on */ }
            }

            _aliasCount = RegisterFiveOneAliases(iss);

            // The virtual registry. A provider rather than proxy functions,
            // because the registry cmdlets talk to a provider: install one and
            // Set-ItemProperty, New-Item, Get-ChildItem and Get-ItemProperty
            // all work as written, and each write is recorded where it happens,
            // with the path resolved. Without it every registry cmdlet fails at
            // "cannot find drive HKCU" before the sample reveals anything.
            iss.Providers.Add(new SessionStateProviderEntry(
                "Registry", typeof(HuskRegistryProvider), helpFileName: null)); // wasm is single-threaded
            // Windows PowerShell 5.1 automatic variables that 7.x dropped.
            // The corpus was generated with Invoke-Obfuscation against 5.1, and
            // (Get-Variable '*MDR*').Name[3,11,2] -join '' - which spells "iex"
            // out of $MaximumDriveCount - is one of its standard cradles.
            foreach (var (name, value) in new[]
            {
                ("MaximumDriveCount", 4096),
                ("MaximumVariableCount", 4096),
                ("MaximumFunctionCount", 4096),
                ("MaximumAliasCount", 4096),
                ("MaximumErrorCount", 256),
                ("MaximumHistoryCount", 4096),
            })
            {
                iss.Variables.Add(new SessionStateVariableEntry(name, value, $"5.1 compatibility: {name}"));
            }

            // The binder chokepoint. Proxy functions are telemetry; this is
            // the thing a sample cannot route around, because every .NET
            // method call in PowerShell passes through it.
            HuskHostHook.SetSinks(
                hostCall: (op, native, args) => HuskHost.RecordFrom("binder", op, native, args),
                cmdletCall: (op, native, args) => HuskHost.RecordFrom("cmdlet", op, native, args));
            HuskHostHook.SetBlockNetwork(true);

            _host = new HuskPSHost();
            _rs = RunspaceFactory.CreateRunspace(_host, iss);
            _rs.Open();

            using (var setup = PowerShell.Create())
            {
                setup.Runspace = _rs;
                setup.AddScript(CDrive);
                setup.AddScript(WebProxies);
                setup.Invoke();
                if (setup.Streams.Error.Count > 0)
                {
                    return "ERR installing proxies: " +
                        string.Join("; ", setup.Streams.Error.Select(e => e.ToString()));
                }
            }

            // Only now, so the host's own setup is not charged against the
            // sample's budget. The numbers are the analyst's to change: 20
            // million statements is far more than any real sample needs and
            // still trips a delay loop in a second or two, and 10 seconds is
            // about as long as anyone will wait on a tab before killing it.
            HuskHostHook.SetBudget(steps: 20_000_000, milliseconds: 10_000);

            // Last, because everything above is configuration. A sample used
            // to be able to undo all of it in three lines of PowerShell; see
            // HuskHostHook's "Sealing" comment for what this does and does
            // not protect.
            _key = HuskHostHook.Seal();

            return "OK";
        }
        catch (Exception ex) { return Describe(ex); }
    }

    /// Lets the analyst raise or lift the budget for one stubborn sample.
    [JSExport]
    internal static void SetBudget(int steps, int milliseconds)
        => HuskHostHook.SetBudget(steps, milliseconds, _key);

    /// The key to the sealed configuration, held so the analyst's own controls
    /// still work after Init. Private, and the only reference anywhere.
    private static object? _key;

    /// Does mono-wasm give us real threads? SMA's pipeline model wants them.
    /// If this throws, no amount of source patching makes pipelines run.
    [JSExport]
    internal static string ThreadProbe()
    {
        var notes = new System.Collections.Generic.List<string>();
        notes.Add("ProcessorCount=" + Environment.ProcessorCount);
        notes.Add("IsBrowser=" + OperatingSystem.IsBrowser());
        try
        {
            var hit = false;
            var t = new System.Threading.Thread(() => { hit = true; });
            t.Start();
            t.Join(5000);
            notes.Add("Thread.Start=OK hit=" + hit);
        }
        catch (Exception ex) { notes.Add("Thread.Start=" + ex.GetType().Name); }
        try
        {
            var done = System.Threading.Tasks.Task.Run(() => 41 + 1).Wait(5000);
            notes.Add("Task.Run+Wait=" + (done ? "OK" : "timeout"));
        }
        catch (Exception ex) { notes.Add("Task.Run+Wait=" + ex.GetType().Name); }
        try
        {
            using var mre = new System.Threading.ManualResetEventSlim(false);
            notes.Add("blockingWait=" + (mre.Wait(50) ? "signalled" : "returned-false"));
        }
        catch (Exception ex) { notes.Add("blockingWait=" + ex.GetType().Name); }
        return string.Join(" | ", notes);
    }

    [JSExport]
    internal static string Run(string script)
    {
        try
        {
            if (_rs is null) { var i = Init(); if (i != "OK") return i; }
            using var ps = PowerShell.Create();
            ps.Runspace = _rs!;
            ps.AddScript(script);
            var results = ps.Invoke();
            var errs = ps.Streams.Error.Count > 0
                ? " | ERRORS: " + string.Join("; ", ps.Streams.Error.Select(e => e.ToString()))
                : "";
            return Join(string.Join("\n", results.Select(r => r?.ToString() ?? "")), Printed(ps)) + errs;
        }
        catch (Exception ex) { return Describe(ex); }
    }


    /// Adds every [Cmdlet] type in an assembly to the session state.
    private static int RegisterCmdlets(InitialSessionState iss, Assembly assembly)
    {
        var added = 0;
        foreach (var type in SafeGetTypes(assembly))
        {
            if (type.IsAbstract || !type.IsPublic) { continue; }
            var attr = type.GetCustomAttribute<CmdletAttribute>();
            if (attr is null) { continue; }
            var name = $"{attr.VerbName}-{attr.NounName}";
            iss.Commands.Add(new SessionStateCmdletEntry(name, type, helpFileName: null));
            _registered.Add(name);
            added++;
        }
        return added;
    }

    /// The types an assembly can actually load.
    ///
    /// GetTypes() throws ReflectionTypeLoadException whole if *any* type fails
    /// to resolve, and types do fail once an assembly is left out of the
    /// bundle deliberately: ConvertFrom-Markdown names Markdig types in its
    /// signature, and Markdig is 548 KB gzipped for a cmdlet no sample uses.
    /// Taking the types that did load means a cmdlet whose dependency is gone
    /// is simply absent, rather than taking every other cmdlet in the
    /// assembly down with it.
    private static IEnumerable<Type> SafeGetTypes(Assembly assembly)
    {
        try
        {
            return assembly.GetTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            return ex.Types.Where(t => t is not null)!;
        }
    }

    /// Every cmdlet name registered off an assembly, so the alias table can
    /// skip aliases whose target is not in this bundle.
    private static readonly HashSet<string> _registered =
        new(StringComparer.OrdinalIgnoreCase);

    /// The Windows PowerShell 5.1 default aliases.
    ///
    /// Registering cmdlets off the assembly gets the cmdlets but not the
    /// aliases its module manifest would have declared, and obfuscators reach
    /// for aliases constantly - `LS Variable:x` to read a variable without
    /// writing Get-Variable, `%`, `?`, `iex`, `sal` to re-alias a cmdlet under
    /// a name no detection rule looks for. A missing alias is not a wrong
    /// answer, it is the sample failing at command resolution.
    private static readonly (string Alias, string Cmdlet)[] FiveOneAliases =
    {
        ("%", "ForEach-Object"), ("?", "Where-Object"), ("ac", "Add-Content"),
        ("cat", "Get-Content"), ("cd", "Set-Location"), ("chdir", "Set-Location"),
        ("clc", "Clear-Content"), ("clear", "Clear-Host"), ("cli", "Clear-Item"),
        ("clp", "Clear-ItemProperty"), ("cls", "Clear-Host"), ("clv", "Clear-Variable"),
        ("compare", "Compare-Object"), ("copy", "Copy-Item"), ("cp", "Copy-Item"),
        ("cpi", "Copy-Item"), ("cpp", "Copy-ItemProperty"), ("curl", "Invoke-WebRequest"),
        ("cvpa", "Convert-Path"), ("dbp", "Disable-PSBreakpoint"), ("del", "Remove-Item"),
        ("diff", "Compare-Object"), ("dir", "Get-ChildItem"), ("ebp", "Enable-PSBreakpoint"),
        ("echo", "Write-Output"), ("epal", "Export-Alias"), ("epcsv", "Export-Csv"),
        ("erase", "Remove-Item"), ("fc", "Format-Custom"), ("fl", "Format-List"),
        ("foreach", "ForEach-Object"), ("ft", "Format-Table"), ("fw", "Format-Wide"),
        ("gal", "Get-Alias"), ("gbp", "Get-PSBreakpoint"), ("gc", "Get-Content"),
        ("gci", "Get-ChildItem"), ("gcm", "Get-Command"), ("gcs", "Get-PSCallStack"),
        ("gdr", "Get-PSDrive"), ("ghy", "Get-History"), ("gi", "Get-Item"),
        ("gl", "Get-Location"), ("gm", "Get-Member"), ("gmo", "Get-Module"),
        ("gp", "Get-ItemProperty"), ("gps", "Get-Process"), ("group", "Group-Object"),
        ("gsv", "Get-Service"), ("gu", "Get-Unique"), ("gv", "Get-Variable"),
        ("h", "Get-History"), ("history", "Get-History"), ("iex", "Invoke-Expression"),
        ("ihy", "Invoke-History"), ("ii", "Invoke-Item"), ("ipal", "Import-Alias"),
        ("ipcsv", "Import-Csv"), ("ipmo", "Import-Module"), ("irm", "Invoke-RestMethod"),
        ("iwr", "Invoke-WebRequest"), ("kill", "Stop-Process"), ("ls", "Get-ChildItem"),
        ("measure", "Measure-Object"), ("mi", "Move-Item"), ("mount", "New-PSDrive"),
        ("move", "Move-Item"), ("mp", "Move-ItemProperty"), ("mv", "Move-Item"),
        ("nal", "New-Alias"), ("ndr", "New-PSDrive"), ("ni", "New-Item"),
        ("nmo", "New-Module"), ("nv", "New-Variable"), ("oh", "Out-Host"),
        ("popd", "Pop-Location"), ("ps", "Get-Process"), ("pushd", "Push-Location"),
        ("pwd", "Get-Location"), ("r", "Invoke-History"), ("rbp", "Remove-PSBreakpoint"),
        ("rd", "Remove-Item"), ("rdr", "Remove-PSDrive"), ("ren", "Rename-Item"),
        ("ri", "Remove-Item"), ("rm", "Remove-Item"), ("rmdir", "Remove-Item"),
        ("rmo", "Remove-Module"), ("rni", "Rename-Item"), ("rnp", "Rename-ItemProperty"),
        ("rp", "Remove-ItemProperty"), ("rv", "Remove-Variable"), ("rvpa", "Resolve-Path"),
        ("sal", "Set-Alias"), ("saps", "Start-Process"), ("sasv", "Start-Service"),
        ("sbp", "Set-PSBreakpoint"), ("sc", "Set-Content"), ("select", "Select-Object"),
        ("set", "Set-Variable"), ("si", "Set-Item"), ("sl", "Set-Location"),
        ("sleep", "Start-Sleep"), ("sort", "Sort-Object"), ("sp", "Set-ItemProperty"),
        ("spps", "Stop-Process"), ("spsv", "Stop-Service"), ("start", "Start-Process"),
        ("sv", "Set-Variable"), ("tee", "Tee-Object"), ("type", "Get-Content"),
        ("where", "Where-Object"), ("write", "Write-Output"),
    };

    private static int RegisterFiveOneAliases(InitialSessionState iss)
    {
        // CreateDefault2 already declares some of these, several of them
        // AllScope, and re-adding one without that option throws during
        // Open ("the AllScope option cannot be removed from the alias 'cd'")
        // and takes the whole runspace down. Adding only what is missing
        // sidesteps having to know which ones those are.
        var existing = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in iss.Commands)
        {
            existing.Add(entry.Name);
        }

        var added = 0;
        foreach (var (alias, cmdlet) in FiveOneAliases)
        {
            if (existing.Contains(alias) || !_registered.Contains(cmdlet)) { continue; }
            iss.Commands.Add(new SessionStateAliasEntry(alias, cmdlet));
            existing.Add(alias);
            added++;
        }
        return added;
    }

    /// How many cmdlets actually made it in, for the probe.
    [JSExport]
    internal static string CmdletCount()
    {
        try
        {
            using var ps = PowerShell.Create();
            ps.Runspace = _rs!;
            ps.AddScript("(Get-Command -CommandType Cmdlet).Count");
            var live = string.Join(",", ps.Invoke().Select(r => r?.ToString() ?? ""));
            return $"registered={_cmdletCount} live={live}";
        }
        catch (Exception ex) { return Describe(ex); }
    }



    // ---- Web proxies ----------------------------------------------------
    //
    // PowerShell's web cmdlets use sync-over-async internally, which is
    // unsupported single-threaded, so they throw before anything reaches the
    // fetch boundary. The URL is lost - and the URL is usually the indicator
    // the analyst came for.
    //
    // Functions outrank cmdlets in command resolution, so defining these
    // shadows the real ones. They record and return a typed absence rather
    // than throwing, which keeps execution going (commitment 2) and keeps the
    // IOC. The fetch boundary stays underneath as the thing that cannot be
    // bypassed; this layer exists for the quality of what gets recorded.

    private const string WebProxies = @"
# Invoke-Expression is the eval() of this tool: every time a sample hands
# text back to the engine, that text is a decoded layer. Record it, then run
# it so nested layers unwrap too.
function Invoke-Expression {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true, Position=0, ValueFromPipeline=$true)] [string] $Command
    )
    [HuskHost]::RecordLayer($Command)
    & $global:HuskRealIex -Command $Command
}
Set-Alias iex Invoke-Expression -Scope Global -Force

function Invoke-WebRequest {
    [CmdletBinding()]
    param(
        [Parameter(Position=0, ValueFromPipeline=$true)] $Uri,
        [string] $Method = 'GET',
        $Body, $Headers, $OutFile, $UserAgent,
        [Parameter(ValueFromRemainingArguments=$true)] $Rest
    )
    [HuskHost]::Record('network.http', 'Invoke-WebRequest', @($Method, [string]$Uri))
    if ($OutFile) {
        [HuskHost]::Record('filesystem.write', 'Invoke-WebRequest -OutFile', @([string]$OutFile))
    }
    $r = New-Object PSObject
    $r | Add-Member NoteProperty StatusCode 523
    $r | Add-Member NoteProperty StatusDescription 'Husk: network blocked'
    $r | Add-Member NoteProperty Content $null
    $r | Add-Member NoteProperty RawContent $null
    $r | Add-Member NoteProperty HuskBlocked $true
    $r
}
Set-Alias iwr Invoke-WebRequest -Scope Global -Force
Set-Alias curl Invoke-WebRequest -Scope Global -Force
Set-Alias wget Invoke-WebRequest -Scope Global -Force

function Invoke-RestMethod {
    [CmdletBinding()]
    param(
        [Parameter(Position=0, ValueFromPipeline=$true)] $Uri,
        [string] $Method = 'GET',
        $Body, $Headers, $OutFile,
        [Parameter(ValueFromRemainingArguments=$true)] $Rest
    )
    [HuskHost]::Record('network.http', 'Invoke-RestMethod', @($Method, [string]$Uri))
    $null
}
Set-Alias irm Invoke-RestMethod -Scope Global -Force

function Start-BitsTransfer {
    [CmdletBinding()]
    param($Source, $Destination, [Parameter(ValueFromRemainingArguments=$true)] $Rest)
    [HuskHost]::Record('network.download', 'Start-BitsTransfer', @([string]$Source, [string]$Destination))
    $null
}

# New-Object is the classic cradle: New-Object Net.WebClient. Hand back a fake
# whose methods record, and fall through to the real cmdlet for everything
# else so ordinary object creation is untouched.
#
# The real cmdlet is captured by reference now, before the proxy shadows it.
# Module-qualifying it would not work: cmdlets are registered directly here,
# not as a module, so there is no Microsoft.PowerShell.Utility to qualify with.
$global:HuskRealNewObject = Get-Command -Name New-Object -CommandType Cmdlet
$global:HuskRealIex = Get-Command -Name Invoke-Expression -CommandType Cmdlet

# Add-Type cannot work here and never will: Roslyn is 10.6 MB gzipped - 86% of
# the whole bundle - and even with it present the cmdlet's type initializer
# throws on wasm. The C# a sample hands it is still evidence, and in malware it
# is nearly always a P/Invoke declaration, which names the Windows API the
# sample intends to call. Recording the source and returning is strictly more
# useful than a TypeInitializationException.
function Add-Type {
    [CmdletBinding()]
    param(
        [Parameter(Position=0)] [string[]] $TypeDefinition,
        [string[]] $MemberDefinition,
        [string[]] $Path,
        [string[]] $LiteralPath,
        [string] $Name,
        [string] $Namespace,
        [string[]] $AssemblyName,
        [Parameter(ValueFromRemainingArguments=$true)] $Rest
    )

    $source = @()
    if ($TypeDefinition) { $source += $TypeDefinition }
    if ($MemberDefinition) { $source += $MemberDefinition }
    if ($Path) { $source += $Path }
    if ($LiteralPath) { $source += $LiteralPath }
    if ($AssemblyName) { $source += $AssemblyName }
    [HuskHost]::Record('assembly.define-type', 'Add-Type', [string[]]$source)

    # P/Invoke declarations are the common case, so name the imports too: the
    # API a sample declares is an indicator on its own, even unexecuted.
    foreach ($text in $source) {
        foreach ($m in [regex]::Matches([string]$text, '(?i)DllImport\s*\(\s*""([^""]+)""')) {
            [HuskHost]::Record('assembly.pinvoke', 'Add-Type DllImport', @($m.Groups[1].Value))
        }
    }
}

function New-Object {
    [CmdletBinding()]
    param(
        [Parameter(Position=0)] [string] $TypeName,
        [Parameter(Position=1)] $ArgumentList,
        [string] $ComObject,
        [Parameter(ValueFromRemainingArguments=$true)] $Rest
    )

    if ($ComObject) {
        [HuskHost]::Record('process.start', ""New-Object -ComObject $ComObject"", @([string]$ComObject))
        $c = & $global:HuskRealNewObject -TypeName PSObject
        $c | Add-Member ScriptMethod Run { param($cmd) [HuskHost]::Record('process.start', 'WScript.Shell.Run', @([string]$cmd)); 0 } -Force
        $c | Add-Member ScriptMethod Exec { param($cmd) [HuskHost]::Record('process.start', 'WScript.Shell.Exec', @([string]$cmd)); $null } -Force
        $c | Add-Member ScriptMethod RegWrite { param($k,$v) [HuskHost]::Record('registry.write', 'WScript.Shell.RegWrite', @([string]$k, [string]$v)); $null } -Force
        $c | Add-Member ScriptMethod RegRead { param($k) [HuskHost]::Record('registry.read', 'WScript.Shell.RegRead', @([string]$k)); $null } -Force
        return $c
    }

    if ($TypeName -match '(^|\.)WebClient$') {
        # Deliberately not recorded. Constructing a WebClient reaches nothing:
        # no name resolved, no socket opened, no request made. Every actual
        # operation on it is recorded when it happens, and 'network.client'
        # was not a canonical op - it existed only here, which is how a
        # vocabulary stops being one.
        $w = & $global:HuskRealNewObject -TypeName PSObject
        $w | Add-Member NoteProperty Headers (& $global:HuskRealNewObject -TypeName PSObject) -Force
        $w | Add-Member ScriptMethod DownloadString { param($u) [HuskHost]::Record('network.http', 'Net.WebClient.DownloadString', @('GET', [string]$u)); $null } -Force
        $w | Add-Member ScriptMethod DownloadData { param($u) [HuskHost]::Record('network.http', 'Net.WebClient.DownloadData', @('GET', [string]$u)); $null } -Force
        $w | Add-Member ScriptMethod DownloadFile { param($u,$f) [HuskHost]::Record('network.download', 'Net.WebClient.DownloadFile', @([string]$u, [string]$f)); [HuskHost]::Record('filesystem.write', 'Net.WebClient.DownloadFile', @([string]$f)); $null } -Force
        $w | Add-Member ScriptMethod UploadString { param($u,$d) [HuskHost]::Record('network.upload', 'Net.WebClient.UploadString', @([string]$u)); $null } -Force
        return $w
    }

    if ($PSBoundParameters.ContainsKey('ArgumentList')) {
        & $global:HuskRealNewObject -TypeName $TypeName -ArgumentList $ArgumentList
    } else {
        & $global:HuskRealNewObject -TypeName $TypeName
    }
}
";

    // ---- Dropped-file capture -------------------------------------------
    //
    // Every file write a sample performs - [IO.File]::WriteAllText, Out-File,
    // Set-Content, a .NET FileStream - lands in the wasm in-memory
    // filesystem. Nothing reaches the host, and nothing in PowerShell can
    // route around it, because the boundary is below .NET rather than beside
    // it. So the capture is a diff: snapshot before, walk after.

    private static HashSet<string> _baseline = new();

    /// Paths that exist before the sample runs, so they are not "dropped".
    [JSExport]
    internal static string ProxyCalls() => HuskHost.Drain();

    /// Everything the script tried to print, as opposed to what it returned.
    ///
    /// Write-Host does not reach PSHost.UI when the engine is driven through
    /// the SDK: WriteHostCommand emits an InformationRecord, and with no
    /// console host draining the information stream it lands in
    /// ps.Streams.Information instead. A sample's Write-Host payload is the
    /// evidence, so both sources are folded into the output: the information
    /// stream, and the host buffer for the calls that do reach $Host.UI.Write.
    private static string Printed(PowerShell ps)
    {
        // With $InformationPreference at Continue the engine both records the
        // InformationRecord and relays it to $Host.UI, so taking both sources
        // unconditionally prints every Write-Host twice. The host buffer is the
        // better of the two when it has anything — it preserves the newlines
        // Write-Host emitted — so the information stream is the fallback for
        // records the host never saw.
        var written = _host?.Ui.Drain() ?? "";
        if (written.Length > 0)
        {
            return written;
        }

        var parts = new List<string>();
        foreach (var record in ps.Streams.Information)
        {
            var text = record?.MessageData?.ToString();
            if (!string.IsNullOrEmpty(text))
            {
                parts.Add(text);
            }
        }

        return string.Join("\n", parts);
    }

    private static string Join(string first, string second)
    {
        if (first.Length == 0) { return second; }
        if (second.Length == 0) { return first; }
        return first + "\n" + second;
    }

    /// Runs one corpus fixture and returns its output plus every layer that
    /// Invoke-Expression was handed, as JSON. Errors are reported rather than
    /// thrown: a fixture that fails is a data point, not a crash.
    [JSExport]
    internal static string RunFixture(string script)
    {
        HuskHost.TakeLayers();
        HuskHostHook.BeginRun(_key);
        VirtualRegistry.Reset();
        string output;
        string error = "";

        // Whether the pipeline ran to the end, which is not the same question
        // as whether the sample raised an error: Start-Process failing is a
        // non-terminating error and the script carries on afterwards. Only the
        // first tells an analyst the analysis is incomplete.
        var completed = false;
        try
        {
            using var ps = PowerShell.Create();
            ps.Runspace = _rs!;
            ps.AddScript(script);
            var results = ps.Invoke();
            output = Join(string.Join("\n", results.Select(r => r?.ToString() ?? "")), Printed(ps));

            if (ps.Streams.Error.Count > 0)
            {
                error = ps.Streams.Error[0].ToString();
            }

            completed = true;
        }
        catch (Exception ex) { output = ""; error = ex.GetType().Name + ": " + ex.Message; }

        // A budget stop is not the sample's error, and reporting it as
        // "PipelineStoppedException" would read like an engine fault. It is a
        // partial result: everything up to the cutoff is still evidence.
        if (HuskHostHook.BudgetExceeded)
        {
            error = "husk: " + HuskHostHook.BudgetReason;

            // The budget throws PipelineStoppedException, which the pipeline
            // handles itself rather than letting out to the host - so Invoke
            // returns normally and the try block completes. Measured: without
            // this line a run cut off after ten seconds reported itself as
            // having run to the end.
            completed = false;
        }

        var layers = string.Join(",", HuskHost.TakeLayers().Select(HuskHost.JsonQuotePublic));
        return "{\"output\":" + HuskHost.JsonQuotePublic(output) +
               ",\"error\":" + HuskHost.JsonQuotePublic(error) +
               ",\"completed\":" + (completed ? "true" : "false") +
               ",\"layers\":[" + layers + "]}";
    }

    /// The registry as the sample left it, for the report.
    ///
    /// The op timeline says what was attempted; this says what the machine
    /// would look like afterwards, which is the artefact an analyst compares
    /// against a known-good image. Only keys carrying values are listed - the
    /// empty ones are Husk's own scaffolding.
    [JSExport]
    internal static string RegistryDump()
    {
        var keys = new List<string>();
        foreach (var key in VirtualRegistry.Populated())
        {
            // Each value says whether it is Husk's or the sample's. A dump
            // that cannot tell them apart is not evidence of anything.
            var values = key.Values.Select(v =>
                "{\"name\":" + HuskHost.JsonQuotePublic(v.Key) +
                ",\"value\":" + HuskHost.JsonQuotePublic(v.Value?.ToString() ?? "$null") +
                ",\"seeded\":" + (key.Seeded.Contains(v.Key) ? "true" : "false") + "}");
            keys.Add(
                "{\"path\":" + HuskHost.JsonQuotePublic(key.Path) +
                ",\"values\":[" + string.Join(",", values) + "]}");
        }

        return "[" + string.Join(",", keys) + "]";
    }

    [JSExport]
    internal static int SnapshotFs()
    {
        _baseline = new HashSet<string>(WalkAll(), StringComparer.Ordinal);
        return _baseline.Count;
    }

    private static IEnumerable<string> WalkAll()
    {
        // The whole virtual root. Assemblies arrive over HTTP and are not on
        // this filesystem, so there is very little here to begin with.
        foreach (var path in SafeEnumerate("/"))
        {
            yield return path;
        }
    }

    private static IEnumerable<string> SafeEnumerate(string root)
    {
        List<string> found = new();
        try
        {
            found.AddRange(Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories));
        }
        catch (Exception)
        {
            // A browser filesystem can refuse a subtree; a partial walk is
            // still worth reporting, and never aborting is commitment 2.
        }

        return found;
    }

    /// Files the sample created or modified, newest first, as JSON.
    [JSExport]
    internal static string DroppedFiles()
    {
        var rows = new List<string>();
        foreach (var path in WalkAll())
        {
            if (_baseline.Contains(path)) { continue; }

            long size = 0;
            string sha = "";
            string head = "";
            try
            {
                var bytes = File.ReadAllBytes(path);
                size = bytes.LongLength;
                sha = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
                // First bytes as hex, so a PE header or script magic is
                // visible in the listing without downloading anything.
                head = Convert.ToHexString(bytes.AsSpan(0, Math.Min(16, bytes.Length)))
                    .ToLowerInvariant();
            }
            catch (Exception ex) { sha = "unreadable: " + ex.GetType().Name; }

            rows.Add($"{{\"path\":{Quote(path)},\"size\":{size}," +
                     $"\"sha256\":{Quote(sha)},\"head\":{Quote(head)}}}");
        }

        return "[" + string.Join(",", rows) + "]";
    }

    /// The bytes of one dropped file, for the analyst to save.
    [JSExport]
    internal static byte[] ReadDropped(string path)
    {
        try { return File.ReadAllBytes(path); }
        catch (Exception) { return Array.Empty<byte>(); }
    }

    private static string Quote(string value)
    {
        var sb = new StringBuilder("\"");
        foreach (var c in value)
        {
            if (c == '"' || c == '\\') { sb.Append('\\').Append(c); }
            else if (c < ' ') { sb.Append("\\u").Append(((int)c).ToString("x4")); }
            else { sb.Append(c); }
        }

        return sb.Append('"').ToString();
    }

    private static string Describe(Exception ex)
    {
        var sb = new System.Text.StringBuilder();
        var depth = 0;
        for (Exception? e = ex; e is not null && depth < 5; e = e.InnerException, depth++)
        {
            sb.Append(depth == 0 ? "ERR " : "  INNER-> ");
            sb.Append(e.GetType().Name).Append(": ").Append(e.Message).Append('\n');
            foreach (var f in (e.StackTrace ?? "").Split('\n').Select(l => l.Trim())
                         .Where(l => l.Length > 0).Take(4))
            {
                sb.Append("      ").Append(f).Append('\n');
            }
        }
        return sb.ToString();
    }

    public static void Main() => Console.WriteLine("host started");
}
