#!/usr/bin/env python3
# Husk - PowerShell deobfuscation and IOC extraction, fully browser-local.
# SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
# Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
#
# Puts the engine's assemblies into a published AppBundle.
#
# The wasm SDK builds its assembly list from the runtime pack plus package
# runtime assets, and a bare <Reference> never reaches it - so the patched
# PowerShell assemblies and SMA's dependency closure have to be copied in and
# added to blazor.boot.json by hand, with the SHA-256 the loader verifies.
#
# Shared by the local rebuild and by CI, because an injection step that drifts
# between the two is a bundle that works on one machine.

import base64
import hashlib
import json
import os
import shutil
import sys

# Left out deliberately.
#
# Roslyn is 10.6 MB gzipped, 40% of the download, and it exists for Add-Type,
# which cannot work in a browser: even with Roslyn present the cmdlet's type
# initializer throws on wasm, and the P/Invoke declarations samples write it
# for have no native library to reach. A proxy records the C# source and the
# imports it declares instead, which is the part an analyst wants. The Utility
# csproj also excludes AddType.cs for browser-wasm, because dropping only the
# package reference leaves the file referencing types that cannot resolve, and
# Assembly.GetTypes() then throws whole - measured, 220 live cmdlets fell to
# 105.
#
# Microsoft.ApplicationInsights stays, though telemetry is opted out: SMA holds
# a static field of a type from it, and the field's type has to load for the
# class to initialise at all.
#
# SMA-unix.dll is the same assembly under its file name: the app references the
# patched SMA that way, so the SDK bundles it twice and the loader downloads
# 2 MB for nothing.
SKIP = {
    "Microsoft.CodeAnalysis.dll",
    "Microsoft.CodeAnalysis.CSharp.dll",
    "Humanizer.dll",
    "SMA-unix.dll",
}

if os.environ.get("HUSK_NO_SKIP"):
    # For an A/B measurement of what the exclusions are worth.
    SKIP = {"SMA-unix.dll"}


def main() -> int:
    bundle = sys.argv[1]
    source = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("HUSK_DEPS")
    if not source:
        print("usage: inject.py <AppBundle> [deps-directory]", file=sys.stderr)
        print("   or: HUSK_DEPS=<deps-directory> inject.py <AppBundle>", file=sys.stderr)
        return 2

    framework = os.path.join(bundle, "_framework")
    boot_path = os.path.join(framework, "blazor.boot.json")
    with open(boot_path) as handle:
        boot = json.load(handle)

    assemblies = boot["resources"]["assembly"]
    injected = 0

    for name in sorted(os.listdir(source)):
        if not name.endswith(".dll") or name == "deps.dll" or name in SKIP:
            continue
        # Anything the runtime pack already supplies stays as it is; SMA is the
        # exception, because the patched build has to win over the package's.
        if name in assemblies and name != "System.Management.Automation.dll":
            continue

        target = os.path.join(framework, name)
        shutil.copyfile(os.path.join(source, name), target)
        with open(target, "rb") as handle:
            digest = hashlib.sha256(handle.read()).digest()
        assemblies[name] = "sha256-" + base64.b64encode(digest).decode()
        injected += 1

    # Already in the bundle from the publish, or pulled in by the runtime pack:
    # drop them from the manifest too, or the loader fetches them anyway.
    removed = 0
    for name in SKIP:
        if name in assemblies:
            del assemblies[name]
            removed += 1
        path = os.path.join(framework, name)
        if os.path.exists(path):
            os.remove(path)

    with open(boot_path, "w") as handle:
        json.dump(boot, handle, indent=2)

    print(
        f"injected {injected} assemblies; "
        f"skipped {len(SKIP)} ({removed} removed from the manifest); "
        f"total {len(assemblies)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
