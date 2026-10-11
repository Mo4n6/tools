using System;
using System.IO;
using System.Linq;
using System.Management.Automation;
using System.Management.Automation.Runspaces;
using System.Runtime.InteropServices.JavaScript;

public static partial class Spike
{
    private static Runspace? _rs;

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
            iss.ThreadOptions = PSThreadOptions.UseCurrentThread; // wasm is single-threaded
            _rs = RunspaceFactory.CreateRunspace(iss);
            _rs.Open();
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
