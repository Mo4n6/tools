#!/usr/bin/env bash
# Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
# SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
# Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
#
# Builds the wasm PowerShell engine from scratch, reproducibly.
#
# Everything this does was worked out by hand first and lived in a work log.
# That is the difference between resumable and reproducible: the log tells you
# what happened, this tells the machine. It is also what lets the engine be
# built in CI instead of committed — 16 MB gzipped of .NET assemblies is a lot
# of permanent git history for something a build can produce.
#
#   scripts/husk/engine/build.sh [output-directory]
#
# Needs: dotnet SDK 8, the wasm-tools workload installed for that SDK's own
# feature band, pwsh, git, python3. It checks the workload before the slow part
# and says what to run; HUSK_ENGINE_INSTALL_WORKLOAD=1 lets it install it.
# Takes a few minutes from cold, most of it PowerShell's own codegen and three
# assembly builds: measured at 2m24s on a cold GitHub runner and about 3
# minutes here. An earlier header said 20-40 minutes, which was a guess from
# the first hand-driven builds and never remeasured - it is corrected because
# the overstatement is actively misleading, having twice made a fast run look
# like a failure and a real failure look merely fast.
#
# The result is an AppBundle directory to serve at VITE_HUSK_ENGINE_URL.

set -euo pipefail

readonly PS_TAG="v7.4.6"
readonly PS_VERSION="7.4.6"
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly PATCH="$REPO_ROOT/scripts/husk/wasm-spike/patches/0001-powershell-browser-wasm.patch"
readonly SPIKE="$REPO_ROOT/scripts/husk/wasm-spike"
readonly WORK="${HUSK_ENGINE_WORK:-${TMPDIR:-/tmp}/husk-engine-build}"
readonly OUT="${1:-$WORK/AppBundle}"

export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1

say() { printf '\n==> %s\n' "$*"; }

# PowerShell promotes IL trim and AOT warnings to errors, and there are 264 of
# them, all advisory. The wasm RID also demands a Main unless told otherwise.
readonly BUILD_FLAGS=(
  -c Release -r browser-wasm --self-contained false
  -p:OutputType=Library
  -p:EnableTrimAnalyzer=false -p:SuppressTrimAnalysisWarnings=true
  -p:TreatWarningsAsErrors=false -p:WarningsAsErrors=
  -p:EnableAotAnalyzer=false -p:EnableSingleFileAnalyzer=false
  # The version comes from `git describe` through PowerShell.Common.props, and
  # a shallow clone has no tags to describe. Unpinned, SMA builds as 7.4.5.0
  # while the Commands assemblies build as 7.4.6.0 and reference SMA 7.4.6.0,
  # which fails to compile with CS1705.
  "-p:AssemblyVersion=$PS_VERSION.0" "-p:FileVersion=$PS_VERSION.0"
)

mkdir -p "$WORK"

# ---------------------------------------------------------------- the fork ---
if [[ ! -d "$WORK/PowerShell/.git" ]]; then
  say "cloning PowerShell $PS_TAG"
  git clone --depth 1 --branch "$PS_TAG" --single-branch \
    https://github.com/PowerShell/PowerShell.git "$WORK/PowerShell"
fi

cd "$WORK/PowerShell"
if git apply --check "$PATCH" 2>/dev/null; then
  say "applying the port patches"
  git apply "$PATCH"
elif git apply --reverse --check "$PATCH" 2>/dev/null; then
  say "patches are already applied"
else
  echo "the patch series does not apply to $PS_TAG and is not already applied;" >&2
  echo "regenerate it from the fork, or check the tag" >&2
  exit 1
fi

# ------------------------------------------------------- the wasm workload ---
# Which SDK compiles this is decided by the clone's own global.json, which the
# patch pins to the 8.0 band and rolls forward to the newest one installed. The
# wasm-tools workload is recorded per SDK feature band, so the install has to
# resolve the same SDK the build will, which means running it from in here.
#
# Run anywhere without that global.json - a repository root, CI's workspace -
# `dotnet workload install wasm-tools` resolves the newest SDK on the machine
# instead. A GitHub runner carries .NET 10 beside 8.0.4xx, so the workload
# lands in band 10.0.400, the build resolves 8.0.425, and it dies with
# NETSDK1147 having already spent the clone and the codegen.
#
# Installing a workload mutates the whole dotnet installation, so a developer
# gets told rather than surprised; CI opts in through the environment.
if ! dotnet workload list 2>/dev/null | grep -qE '^[[:space:]]*wasm-tools([[:space:]]|$)'; then
  if [[ -n "${HUSK_ENGINE_INSTALL_WORKLOAD:-}" ]]; then
    say "installing wasm-tools for SDK $(dotnet --version)"
    dotnet workload install wasm-tools
    # Asserted, not assumed: this is the one failure that otherwise surfaces
    # much later as a compiler error about a missing workload, from a build
    # that has already spent the clone and the codegen.
    if ! dotnet workload list | grep -qE '^[[:space:]]*wasm-tools([[:space:]]|$)'; then
      echo "installed wasm-tools, but SDK $(dotnet --version) still does not see it" >&2
      exit 1
    fi
  else
    echo "wasm-tools is not installed for SDK $(dotnet --version), which is the" >&2
    echo "one this build resolves through $PWD/global.json." >&2
    echo >&2
    echo "install it for that SDK - the directory matters - with:" >&2
    echo "  (cd $PWD && dotnet workload install wasm-tools)" >&2
    echo >&2
    echo "or set HUSK_ENGINE_INSTALL_WORKLOAD=1 to have this script do it." >&2
    exit 1
  fi
fi

# -------------------------------------------------------------- codegen -----
# Both are required. Without them the build emits 7,714 CS0103 errors for
# missing *Strings resource classes, because `dotnet build` on a csproj alone
# skips PowerShell's own code generation.
if [[ ! -f "$WORK/.codegen-done" ]]; then
  say "running PowerShell's resource and type generation"
  pwsh -NoProfile -c 'Import-Module ./build.psm1 -Force; Start-ResGen; Start-TypeGen'
  touch "$WORK/.codegen-done"
fi

# ------------------------------------------------------------ assemblies ----
# Each project is built explicitly, because **only the project named on the
# command line gets the browser-wasm output**. Its dependencies build for the
# default RID into a directory with no RID in the path, and a project nothing
# references is not built at all — measured by building Management alone and
# finding no Utility anywhere and SMA only under `net8.0/`.
say "building the engine assemblies for browser-wasm (this is the slow part)"
for project in \
  src/System.Management.Automation/System.Management.Automation.csproj \
  src/Microsoft.PowerShell.Commands.Utility/Microsoft.PowerShell.Commands.Utility.csproj \
  src/Microsoft.PowerShell.Commands.Management/Microsoft.PowerShell.Commands.Management.csproj
do
  say "  $(basename "$project")"
  dotnet build "$project" "${BUILD_FLAGS[@]}"
done

# Collected by search rather than from one directory: Security arrives in
# Management's output because Management references it, and a future assembly
# may land somewhere else again.
readonly STAGE="$WORK/assemblies"
rm -rf "$STAGE"; mkdir -p "$STAGE"
for assembly in \
  System.Management.Automation.dll \
  Microsoft.PowerShell.Commands.Utility.dll \
  Microsoft.PowerShell.Commands.Management.dll \
  Microsoft.PowerShell.Security.dll
do
  found="$(find src -path '*/bin/Release/net8.0/browser-wasm/*' -name "$assembly" -print -quit)"
  if [[ -z "$found" ]]; then
    echo "missing $assembly: no browser-wasm build produced it" >&2
    exit 1
  fi
  cp "$found" "$STAGE/"
  say "  found $assembly in ${found%/*}"
done

# ------------------------------------------------- the dependency closure ---
# SMA's own dependencies are not in the wasm runtime pack, so they are
# harvested from the NuGet package's linux-x64 publish. They are pure managed
# IL and load fine under mono-wasm; only the native bits would not, and SMA has
# none after the port patches.
if [[ ! -d "$WORK/deps/out" ]]; then
  say "harvesting SMA's dependency closure"
  mkdir -p "$WORK/deps"
  cat > "$WORK/deps/deps.csproj" <<XML
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <OutputType>Library</OutputType>
    <RuntimeIdentifier>linux-x64</RuntimeIdentifier>
    <SelfContained>false</SelfContained>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="System.Management.Automation" Version="$PS_VERSION" />
  </ItemGroup>
</Project>
XML
  (cd "$WORK/deps" && dotnet publish -c Release -o out)
fi

# The patched builds win over the package's.
cp "$STAGE"/*.dll "$WORK/deps/out/"

# ------------------------------------------------------------ the app -------
say "publishing the host app"
rm -rf "$WORK/app"
cp -r "$SPIKE" "$WORK/app"
rm -rf "$WORK/app/patches" "$WORK/app/probes" "$WORK/app/aes-vectors" \
  "$WORK/app"/*.mjs "$WORK/app/rebuild.sh"
# The app references the patched SMA by file name; see pswasm.csproj.
cp "$WORK/deps/out/System.Management.Automation.dll" "$WORK/app/SMA-unix.dll"
(cd "$WORK/app" && dotnet publish -c Release)

readonly BUNDLE="$WORK/app/bin/Release/net8.0/browser-wasm/AppBundle"
[[ -d "$BUNDLE" ]] || { echo "no AppBundle after publish" >&2; exit 1; }

# -------------------------------------------------------------- injection ---
# The wasm SDK builds its assembly list from the runtime pack plus package
# runtime assets, and a bare <Reference> never reaches it. So the assemblies
# are copied in and added to the boot manifest by hand, with the SHA-256 the
# loader checks.
say "injecting the engine assemblies into the boot manifest"
HUSK_DEPS="$WORK/deps/out" python3 "$REPO_ROOT/scripts/husk/engine/inject.py" "$BUNDLE"

# ----------------------------------------------------------------- notice ---
# MIT permits shipping these assemblies on one condition: the copyright notice
# and the licence text travel with the copies. Publishing the bundle is
# distributing them, so the notice goes in the bundle rather than only in the
# repository. Generated from the packages that actually put a file here.
say "writing the third-party notice"
python3 "$REPO_ROOT/scripts/husk/engine/notice.py" \
  "$WORK/deps/out/deps.deps.json" "$BUNDLE" "$BUNDLE/THIRD-PARTY-NOTICE.txt"

say "copying the bundle to $OUT"
rm -rf "$OUT"
mkdir -p "$(dirname "$OUT")"
cp -r "$BUNDLE" "$OUT"

printf '\n%s\n' "engine built: $OUT"
printf '%s\n' "third-party notice: $OUT/THIRD-PARTY-NOTICE.txt"
printf '%s\n' "serve it at VITE_HUSK_ENGINE_URL, e.g. VITE_HUSK_ENGINE_URL=/husk-engine/"
