#!/usr/bin/env python3
# Husk - PowerShell deobfuscation and IOC extraction, fully browser-local.
# SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
# Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
#
# Writes the engine bundle's third-party notice.
#
# The engine is a patched build of PowerShell, and the assemblies it ships are
# derivative works of MIT-licensed code. MIT permits that on one condition: the
# copyright notice and the licence text travel with the copies. Published to
# Pages, those copies are being distributed - so the notice has to be in the
# bundle, not only in the repository.
#
# Generated from the package set the build actually resolved, by reading each
# package's own .nuspec out of the NuGet cache. Writing the list by hand would
# be a guess that goes stale the first time a dependency moves, and a licence
# notice that is a guess is worse than useless.

import glob
import json
import os
import sys
import xml.etree.ElementTree as ET

MIT = """MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE."""


def nuspec_license(package: str, version: str) -> str:
    """The licence a package declares, from its own .nuspec."""
    root = os.environ.get("NUGET_PACKAGES") or os.path.expanduser("~/.nuget/packages")
    pattern = os.path.join(root, package.lower(), version.lower(), "*.nuspec")
    found = glob.glob(pattern)
    if not found:
        return "(no .nuspec in the local cache)"

    try:
        tree = ET.parse(found[0])
    except ET.ParseError:
        return "(unreadable .nuspec)"

    # The namespace varies by nuspec schema version, so match on the tag name.
    for element in tree.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        if tag == "license":
            kind = element.get("type", "expression")
            text = (element.text or "").strip()
            return text if kind == "expression" else f"see {text} in the package"
    for element in tree.iter():
        if element.tag.rsplit("}", 1)[-1] == "licenseUrl":
            return (element.text or "").strip()

    return "(the package declares none)"


def shipped_packages(deps: dict, bundle_dir: str) -> list[tuple[str, str]]:
    """
    The packages that actually put a file in the bundle.

    Listing every package the build resolved would name nine that ship nothing
    here - reference-only packages, and the Windows-native runtime for
    Microsoft.Management.Infrastructure, which cannot be in a browser bundle at
    all. A notice is a statement about what is being distributed, so it is
    built from what is in the directory.
    """
    present = {
        name
        for name in os.listdir(os.path.join(bundle_dir, "_framework"))
        if name.endswith(".dll")
    }

    contributed: dict[tuple[str, str], set[str]] = {}
    for target in deps.get("targets", {}).values():
        for key, entry in target.items():
            if "/" not in key:
                continue
            name, version = key.split("/", 1)
            files = list(entry.get("runtime", {})) + list(entry.get("runtimeTargets", {}))
            for path in files:
                contributed.setdefault((name, version), set()).add(os.path.basename(path))

    libraries = deps.get("libraries", {})
    return sorted(
        (
            (name, version)
            for (name, version), files in contributed.items()
            if files & present and libraries.get(f"{name}/{version}", {}).get("type") == "package"
        ),
        key=lambda pair: pair[0].lower(),
    )


def main() -> int:
    if len(sys.argv) < 4:
        print("usage: notice.py <deps.deps.json> <AppBundle> <output-file>", file=sys.stderr)
        return 2

    deps_path, bundle_dir, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(deps_path) as handle:
        deps = json.load(handle)

    packages = shipped_packages(deps, bundle_dir)
    if not packages:
        print("no packages contributed a file to the bundle; refusing to write an empty notice",
              file=sys.stderr)
        return 1

    rows = [(name, version, nuspec_license(name, version)) for name, version in packages]
    non_mit = [row for row in rows if "MIT" not in row[2]]

    width = max((len(f"{name} {version}") for name, version, _ in rows), default=20)
    listing = "\n".join(
        f"  {name} {version}".ljust(width + 4) + f"  {licence}" for name, version, licence in rows
    )

    notice = f"""Third-party notices for Husk's PowerShell engine
================================================

This directory is a build of PowerShell for WebAssembly, patched to run in a
browser. It is not Husk's own code: the assemblies here are derivative works of
MIT-licensed software, and this notice travels with them because MIT requires
it to.

Husk itself is licensed separately; see the LICENSE file at
https://github.com/Mo4n6/tools


PowerShell
----------

Portions of these assemblies are Copyright (c) Microsoft Corporation, licensed
under the MIT License. Built from tag v7.4.6 of
https://github.com/PowerShell/PowerShell with the patch series at
scripts/husk/wasm-spike/patches/0001-powershell-browser-wasm.patch, which is
published in the Husk repository above. Those patches are the only changes.


The .NET runtime
----------------

dotnet.js, dotnet.native.wasm, dotnet.runtime.js and the System.* assemblies
are part of .NET, Copyright (c) .NET Foundation and Contributors, licensed
under the MIT License. See https://github.com/dotnet/runtime


NuGet packages in the dependency closure
----------------------------------------

Every package that contributed an assembly to this directory, with the licence
it declares in its own .nuspec:

{listing}

{'All of the above are MIT.' if not non_mit else 'Not MIT, so read these separately:' + chr(10) + chr(10) + chr(10).join(f'  {n} {v}: {lic}' for n, v, lic in non_mit)}


The MIT License
---------------

{MIT}
"""

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w") as handle:
        handle.write(notice)

    print(f"wrote {out_path}: {len(rows)} packages, {len(non_mit)} not MIT")
    for name, version, licence in non_mit:
        print(f"  not MIT: {name} {version} -> {licence}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
