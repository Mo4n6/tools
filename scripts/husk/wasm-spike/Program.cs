using System;
using System.IO;
using System.Linq;
using System.Management.Automation;
using System.Management.Automation.Runspaces;
using System.Runtime.InteropServices.JavaScript;

public static partial class Spike
{
    private static Runspace? _rs;

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
            var iss = InitialSessionState.Create();
            iss.LanguageMode = PSLanguageMode.FullLanguage;
            iss.ThreadOptions = PSThreadOptions.UseCurrentThread; // wasm is single-threaded
            _rs = RunspaceFactory.CreateRunspace(iss);
            _rs.Open();
            return "OK";
        }
        catch (Exception ex) { return Describe(ex); }
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
        var frames = (ex.StackTrace ?? "").Split('\n').Select(l => l.Trim())
            .Where(l => l.Length > 0).Take(12);
        return $"ERR {ex.GetType().Name}: {ex.Message}\n" + string.Join("\n", frames);
    }

    public static void Main() => Console.WriteLine("host started");
}
