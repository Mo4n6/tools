using System;
using System.IO;
using System.Linq;
using System.Management.Automation;
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

    public static void Record(string op, string nativeSignature, string[] args)
        => RecordFrom("proxy", op, nativeSignature, args);

    public static void RecordFrom(string source, string op, string nativeSignature, string[] args)
    {
        var quoted = string.Join(",", (args ?? Array.Empty<string>()).Select(JsonQuote));
        lock (s_calls)
        {
            s_calls.Add(
                $"{{\"seq\":{s_seq++},\"op\":{JsonQuote(op)}," +
                $"\"native\":{JsonQuote(nativeSignature)},\"args\":[{quoted}],\"source\":{JsonQuote(source)}}}");
        }
    }

    public static string Drain()
    {
        lock (s_calls) { return "[" + string.Join(",", s_calls) + "]"; }
    }

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

public static partial class Spike
{
    private static Runspace? _rs;
    private static int _cmdletCount;

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
            } // wasm is single-threaded
            // The binder chokepoint. Proxy functions are telemetry; this is
            // the thing a sample cannot route around, because every .NET
            // method call in PowerShell passes through it.
            HuskHostHook.OnHostCall = (op, native, args) =>
                HuskHost.RecordFrom("binder", op, native, args);
            HuskHostHook.BlockNetwork = true;

            _rs = RunspaceFactory.CreateRunspace(iss);
            _rs.Open();

            using (var setup = PowerShell.Create())
            {
                setup.Runspace = _rs;
                setup.AddScript(WebProxies);
                setup.Invoke();
                if (setup.Streams.Error.Count > 0)
                {
                    return "ERR installing proxies: " +
                        string.Join("; ", setup.Streams.Error.Select(e => e.ToString()));
                }
            }

            return "OK";
        }
        catch (Exception ex) { return Describe(ex); }
    }

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
            return string.Join("\n", results.Select(r => r?.ToString() ?? "")) + errs;
        }
        catch (Exception ex) { return Describe(ex); }
    }


    /// Adds every [Cmdlet] type in an assembly to the session state.
    private static int RegisterCmdlets(InitialSessionState iss, Assembly assembly)
    {
        var added = 0;
        foreach (var type in assembly.GetTypes())
        {
            if (type.IsAbstract || !type.IsPublic) { continue; }
            var attr = type.GetCustomAttribute<CmdletAttribute>();
            if (attr is null) { continue; }
            iss.Commands.Add(new SessionStateCmdletEntry(
                $"{attr.VerbName}-{attr.NounName}", type, helpFileName: null));
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
        [HuskHost]::Record('network.client', ""New-Object $TypeName"", @([string]$TypeName))
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
