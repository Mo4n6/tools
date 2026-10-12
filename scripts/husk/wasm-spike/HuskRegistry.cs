// Husk wasm spike — a virtual Windows registry, behind a real PowerShell provider.
//
// Why a provider and not proxy functions: a provider is what the registry
// cmdlets talk to. Install one and `Set-ItemProperty HKCU:\…\Run`,
// `New-Item`, `Get-ChildItem Registry::HKLM\Software` and
// `Get-ItemProperty` all work as written, through the real cmdlets, and every
// one of them is recorded at the point the write actually happens — with the
// path resolved and the value as stored. A sample cannot delete it the way it
// can delete a proxy function.
//
// Nothing here touches a real registry. There isn't one: the browser has no
// registry at all, and Microsoft.Win32.Registry throws
// PlatformNotSupportedException on wasm, which is what made every persistence
// attempt abort the sample at the exact moment it revealed itself.
//
// The seeded values are plausible defaults, not real ones — the same rule as
// the environment block. A sample that reads ProductName to decide whether to
// run gets an answer rather than a null.

using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Management.Automation;
using System.Management.Automation.Provider;

/// <summary>One key: its subkeys and its values.</summary>
internal sealed class RegKey
{
    public RegKey(string path) { Path = path; }

    /// <summary>The full path, kept so a record can name the key it changed.</summary>
    public string Path { get; }

    public Dictionary<string, RegKey> Keys { get; } = new(StringComparer.OrdinalIgnoreCase);

    public Dictionary<string, object?> Values { get; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Value names this key was seeded with, so the dump can tell what the
    /// sample wrote from what Husk put there for it to read.
    ///
    /// Without this an analyst reading the dump sees the Shell Folders seed
    /// next to a Run-key write with nothing to distinguish them, which makes
    /// the whole artefact untrustworthy.
    /// </summary>
    public HashSet<string> Seeded { get; } = new(StringComparer.OrdinalIgnoreCase);
}

/// <summary>The store. One per page; no persistence between runs.</summary>
internal static class VirtualRegistry
{
    private static readonly RegKey s_root = new("");

    /// <summary>
    /// Hive abbreviation to full name. Samples write both, and a dropper copied
    /// from a forum post uses whichever its author happened to have.
    /// </summary>
    private static readonly Dictionary<string, string> s_hives = new(StringComparer.OrdinalIgnoreCase)
    {
        ["HKCU"] = "HKEY_CURRENT_USER",
        ["HKLM"] = "HKEY_LOCAL_MACHINE",
        ["HKCR"] = "HKEY_CLASSES_ROOT",
        ["HKU"] = "HKEY_USERS",
        ["HKCC"] = "HKEY_CURRENT_CONFIG",
        ["HKEY_CURRENT_USER"] = "HKEY_CURRENT_USER",
        ["HKEY_LOCAL_MACHINE"] = "HKEY_LOCAL_MACHINE",
        ["HKEY_CLASSES_ROOT"] = "HKEY_CLASSES_ROOT",
        ["HKEY_USERS"] = "HKEY_USERS",
        ["HKEY_CURRENT_CONFIG"] = "HKEY_CURRENT_CONFIG",
    };

    static VirtualRegistry()
    {
        foreach (var hive in s_hives.Values.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            Create(hive);
        }

        // The persistence locations, pre-created so an enumeration of them
        // succeeds rather than erroring, and so a write lands somewhere the
        // report can point at.
        foreach (var key in new[]
        {
            @"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run",
            @"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\RunOnce",
            @"HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\Run",
            @"HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\RunOnce",
            @"HKEY_CURRENT_USER\Environment",
            @"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
        })
        {
            Create(key);
        }

        Seed(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion", new()
        {
            ["ProductName"] = "Windows 10 Pro",
            ["CurrentVersion"] = "6.3",
            ["CurrentBuild"] = "19045",
            ["InstallDate"] = 1600000000,
            ["RegisteredOwner"] = "analyst",
        });

        Seed(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders", new()
        {
            ["AppData"] = @"C:\Users\analyst\AppData\Roaming",
            ["Local AppData"] = @"C:\Users\analyst\AppData\Local",
            ["Desktop"] = @"C:\Users\analyst\Desktop",
            ["Startup"] = @"C:\Users\analyst\Start Menu\Programs\Startup",
            ["Personal"] = @"C:\Users\analyst\Documents",
        });

        // Read by anti-analysis checks. Answering "Defender is present and on"
        // is the answer that keeps a sample on its normal path.
        Seed(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows Defender", new()
        {
            ["InstallLocation"] = @"C:\ProgramData\Microsoft\Windows Defender",
        });
    }

    private static void Seed(string path, Dictionary<string, object?> values)
    {
        RegKey key = Create(path);
        foreach (var (name, value) in values)
        {
            key.Values[name] = value;
            key.Seeded.Add(name);
        }
    }

    /// <summary>
    /// Splits a provider path into segments, accepting either separator and
    /// resolving the hive abbreviation. Returns null for a path whose first
    /// segment is not a hive, which is how the provider rejects nonsense
    /// without throwing.
    /// </summary>
    internal static string[]? Segments(string? path)
    {
        if (string.IsNullOrEmpty(path)) { return Array.Empty<string>(); }

        string trimmed = path.Replace('/', '\\').Trim('\\');
        if (trimmed.Length == 0) { return Array.Empty<string>(); }

        string[] parts = trimmed.Split('\\');
        if (!s_hives.TryGetValue(parts[0], out string? hive)) { return null; }

        parts[0] = hive;
        return parts;
    }

    /// <summary>The canonical spelling of a path, for records and output.</summary>
    internal static string Canonical(string? path)
    {
        string[]? segments = Segments(path);
        return segments is null ? path ?? "" : string.Join("\\", segments);
    }

    internal static RegKey? Find(string? path)
    {
        string[]? segments = Segments(path);
        if (segments is null) { return null; }
        if (segments.Length == 0) { return s_root; }

        RegKey current = s_root;
        foreach (string segment in segments)
        {
            if (!current.Keys.TryGetValue(segment, out RegKey? next)) { return null; }
            current = next;
        }

        return current;
    }

    internal static RegKey Create(string path)
    {
        string[]? segments = Segments(path);
        if (segments is null || segments.Length == 0) { return s_root; }

        RegKey current = s_root;
        var walked = new List<string>(segments.Length);
        foreach (string segment in segments)
        {
            walked.Add(segment);
            if (!current.Keys.TryGetValue(segment, out RegKey? next))
            {
                next = new RegKey(string.Join("\\", walked));
                current.Keys[segment] = next;
            }

            current = next;
        }

        return current;
    }

    internal static bool Remove(string path)
    {
        string[]? segments = Segments(path);
        if (segments is null || segments.Length == 0) { return false; }

        RegKey? parent = Find(string.Join("\\", segments[..^1]));
        return parent is not null && parent.Keys.Remove(segments[^1]);
    }

    /// <summary>Every key that has a value, for the end-of-run report.</summary>
    internal static IEnumerable<RegKey> Populated()
    {
        var stack = new Stack<RegKey>();
        stack.Push(s_root);
        while (stack.Count > 0)
        {
            RegKey key = stack.Pop();
            if (key.Values.Count > 0) { yield return key; }
            foreach (RegKey child in key.Keys.Values) { stack.Push(child); }
        }
    }
}

/// <summary>
/// The provider. Named "Registry" so `Registry::HKEY_CURRENT_USER\…` resolves
/// as it does on Windows, not only the drive-qualified `HKCU:\…` form.
/// </summary>
[CmdletProvider("Registry", ProviderCapabilities.ShouldProcess)]
public sealed class HuskRegistryProvider : NavigationCmdletProvider,
    IPropertyCmdletProvider, IDynamicPropertyCmdletProvider
{
    private static void Record(string op, string native, params string?[] args)
        => HuskHost.RecordFrom("provider", op, native, args.Select(a => a ?? "$null").ToArray());

    private static string Render(object? value) => value switch
    {
        null => "$null",
        string str => str,
        byte[] bytes => $"<byte[{bytes.Length}]>",
        System.Collections.IEnumerable items => string.Join(",", items.Cast<object?>().Select(i => i?.ToString())),
        _ => value.ToString() ?? "",
    };

    // ---- drives -------------------------------------------------------

    protected override Collection<PSDriveInfo> InitializeDefaultDrives()
    {
        var drives = new Collection<PSDriveInfo>();
        foreach (var (name, root) in new[]
        {
            ("HKCU", "HKEY_CURRENT_USER"),
            ("HKLM", "HKEY_LOCAL_MACHINE"),
            ("HKCR", "HKEY_CLASSES_ROOT"),
            ("HKU", "HKEY_USERS"),
            ("HKCC", "HKEY_CURRENT_CONFIG"),
        })
        {
            drives.Add(new PSDriveInfo(name, ProviderInfo, root, $"Husk virtual {root}", credential: null));
        }

        return drives;
    }

    // ---- paths --------------------------------------------------------
    //
    // Overridden rather than inherited: the base implementation joins with the
    // platform separator, which is "/" here, and a registry path with forward
    // slashes in it matches nothing a sample writes.

    protected override bool IsValidPath(string path) => true;

    protected override string MakePath(string parent, string child)
    {
        string p = (parent ?? "").Replace('/', '\\').TrimEnd('\\');
        string c = (child ?? "").Replace('/', '\\').Trim('\\');
        if (p.Length == 0) { return c; }
        return c.Length == 0 ? p : p + "\\" + c;
    }

    protected override string GetParentPath(string path, string root)
    {
        string normalised = (path ?? "").Replace('/', '\\').TrimEnd('\\');
        int cut = normalised.LastIndexOf('\\');
        return cut < 0 ? "" : normalised[..cut];
    }

    protected override string GetChildName(string path)
    {
        string normalised = (path ?? "").Replace('/', '\\').TrimEnd('\\');
        int cut = normalised.LastIndexOf('\\');
        return cut < 0 ? normalised : normalised[(cut + 1)..];
    }

    protected override string NormalizeRelativePath(string path, string basePath)
        => (path ?? "").Replace('/', '\\');

    // ---- items --------------------------------------------------------

    protected override bool ItemExists(string path) => VirtualRegistry.Find(path) is not null;

    protected override bool IsItemContainer(string path) => VirtualRegistry.Find(path) is not null;

    protected override bool HasChildItems(string path)
        => VirtualRegistry.Find(path)?.Keys.Count > 0;

    /// <summary>
    /// What a key looks like to the script. Shaped after the real provider's
    /// output - Name, SubKeyCount, ValueCount, Property - because samples read
    /// .Property and .Name off it.
    /// </summary>
    private static PSObject Describe(RegKey key)
    {
        var item = new PSObject();
        item.Properties.Add(new PSNoteProperty("Name", key.Path));
        item.Properties.Add(new PSNoteProperty("PSChildName", key.Path.Contains('\\')
            ? key.Path[(key.Path.LastIndexOf('\\') + 1)..]
            : key.Path));
        item.Properties.Add(new PSNoteProperty("SubKeyCount", key.Keys.Count));
        item.Properties.Add(new PSNoteProperty("ValueCount", key.Values.Count));
        item.Properties.Add(new PSNoteProperty("Property", key.Values.Keys.ToArray()));
        return item;
    }

    protected override void GetItem(string path)
    {
        RegKey? key = VirtualRegistry.Find(path);
        Record("registry.read", "Registry::GetItem", VirtualRegistry.Canonical(path));
        if (key is not null)
        {
            WriteItemObject(Describe(key), VirtualRegistry.Canonical(path), isContainer: true);
        }
    }

    protected override void GetChildItems(string path, bool recurse)
    {
        Record("registry.enumerate", "Registry::GetChildItems", VirtualRegistry.Canonical(path));
        RegKey? key = VirtualRegistry.Find(path);
        if (key is null) { return; }

        foreach (RegKey child in key.Keys.Values)
        {
            WriteItemObject(Describe(child), child.Path, isContainer: true);
            if (recurse) { GetChildItems(child.Path, recurse: true); }
        }
    }

    protected override void GetChildNames(string path, ReturnContainers returnContainers)
    {
        Record("registry.enumerate", "Registry::GetChildNames", VirtualRegistry.Canonical(path));
        RegKey? key = VirtualRegistry.Find(path);
        if (key is null) { return; }

        foreach (RegKey child in key.Keys.Values)
        {
            WriteItemObject(
                child.Path.Contains('\\') ? child.Path[(child.Path.LastIndexOf('\\') + 1)..] : child.Path,
                child.Path,
                isContainer: true);
        }
    }

    protected override void NewItem(string path, string itemTypeName, object newItemValue)
    {
        Record("registry.write", "Registry::NewItem", VirtualRegistry.Canonical(path), Render(newItemValue));
        RegKey key = VirtualRegistry.Create(path);

        // `New-Item -Path …\Run -Value x` sets the key's default value, the
        // same as the real provider does.
        if (newItemValue is not null)
        {
            key.Values[""] = newItemValue is PSObject wrapped ? wrapped.BaseObject : newItemValue;
        }

        WriteItemObject(Describe(key), key.Path, isContainer: true);
    }

    protected override void RemoveItem(string path, bool recurse)
    {
        Record("registry.delete", "Registry::RemoveItem", VirtualRegistry.Canonical(path));
        VirtualRegistry.Remove(path);
    }

    protected override void ClearItem(string path)
    {
        Record("registry.write", "Registry::ClearItem", VirtualRegistry.Canonical(path));
        VirtualRegistry.Find(path)?.Values.Clear();
    }

    // ---- values -------------------------------------------------------

    public void GetProperty(string path, Collection<string>? providerSpecificPickList)
    {
        RegKey? key = VirtualRegistry.Find(path);
        Record("registry.read", "Registry::GetProperty",
            VirtualRegistry.Canonical(path),
            providerSpecificPickList is null ? "*" : string.Join(",", providerSpecificPickList));
        if (key is null) { return; }

        var result = new PSObject();
        IEnumerable<string> wanted = providerSpecificPickList is { Count: > 0 }
            ? providerSpecificPickList
            : key.Values.Keys;

        foreach (string name in wanted)
        {
            if (key.Values.TryGetValue(name, out object? value))
            {
                result.Properties.Add(new PSNoteProperty(name, value));
            }
        }

        WritePropertyObject(result, VirtualRegistry.Canonical(path));
    }

    public void SetProperty(string path, PSObject propertyValue)
    {
        RegKey key = VirtualRegistry.Create(path);
        foreach (PSPropertyInfo property in propertyValue?.Properties ?? Enumerable.Empty<PSPropertyInfo>())
        {
            object? value = property.Value is PSObject wrapped ? wrapped.BaseObject : property.Value;
            key.Values[property.Name] = value;
            Record("registry.write", "Registry::SetProperty",
                VirtualRegistry.Canonical(path), property.Name, Render(value));
        }

        WritePropertyObject(propertyValue, VirtualRegistry.Canonical(path));
    }

    public void ClearProperty(string path, Collection<string>? propertyToClear)
    {
        RegKey? key = VirtualRegistry.Find(path);
        if (key is null) { return; }

        foreach (string name in propertyToClear ?? new Collection<string>(key.Values.Keys.ToList()))
        {
            Record("registry.delete", "Registry::ClearProperty", VirtualRegistry.Canonical(path), name);
            key.Values[name] = null;
        }
    }

    public void NewProperty(string path, string propertyName, string propertyTypeName, object value)
    {
        RegKey key = VirtualRegistry.Create(path);
        object? stored = value is PSObject wrapped ? wrapped.BaseObject : value;
        key.Values[propertyName ?? ""] = stored;
        Record("registry.write", "Registry::NewProperty",
            VirtualRegistry.Canonical(path), propertyName, Render(stored), propertyTypeName);

        var written = new PSObject();
        written.Properties.Add(new PSNoteProperty(propertyName ?? "", stored));
        WritePropertyObject(written, VirtualRegistry.Canonical(path));
    }

    public void RemoveProperty(string path, string propertyName)
    {
        Record("registry.delete", "Registry::RemoveProperty", VirtualRegistry.Canonical(path), propertyName);
        VirtualRegistry.Find(path)?.Values.Remove(propertyName ?? "");
    }

    public void RenameProperty(string path, string sourceProperty, string destinationProperty)
    {
        RegKey? key = VirtualRegistry.Find(path);
        Record("registry.write", "Registry::RenameProperty",
            VirtualRegistry.Canonical(path), sourceProperty, destinationProperty);
        if (key is null || !key.Values.TryGetValue(sourceProperty ?? "", out object? value)) { return; }

        key.Values.Remove(sourceProperty!);
        key.Values[destinationProperty ?? ""] = value;
    }

    public void CopyProperty(string sourcePath, string sourceProperty, string destinationPath, string destinationProperty)
    {
        RegKey? from = VirtualRegistry.Find(sourcePath);
        Record("registry.write", "Registry::CopyProperty",
            VirtualRegistry.Canonical(sourcePath), sourceProperty,
            VirtualRegistry.Canonical(destinationPath), destinationProperty);
        if (from is null || !from.Values.TryGetValue(sourceProperty ?? "", out object? value)) { return; }

        VirtualRegistry.Create(destinationPath).Values[destinationProperty ?? ""] = value;
    }

    public void MoveProperty(string sourcePath, string sourceProperty, string destinationPath, string destinationProperty)
    {
        CopyProperty(sourcePath, sourceProperty, destinationPath, destinationProperty);
        VirtualRegistry.Find(sourcePath)?.Values.Remove(sourceProperty ?? "");
    }

    // The dynamic-parameter half of the two property interfaces. None of these
    // take provider-specific parameters, so every one is null.
    public object? GetPropertyDynamicParameters(string path, Collection<string> providerSpecificPickList) => null;

    public object? SetPropertyDynamicParameters(string path, PSObject propertyValue) => null;

    public object? ClearPropertyDynamicParameters(string path, Collection<string> propertyToClear) => null;

    public object? NewPropertyDynamicParameters(string path, string propertyName, string propertyTypeName, object value) => null;

    public object? RemovePropertyDynamicParameters(string path, string propertyName) => null;

    public object? RenamePropertyDynamicParameters(string path, string sourceProperty, string destinationProperty) => null;

    public object? CopyPropertyDynamicParameters(string sourcePath, string sourceProperty, string destinationPath, string destinationProperty) => null;

    public object? MovePropertyDynamicParameters(string sourcePath, string sourceProperty, string destinationPath, string destinationProperty) => null;
}
