set -e
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
# Resolved before the cd below, or it resolves against the wrong directory.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SP=/tmp/claude-0/-home-user-tools/f3a22558-a597-5b7f-9b79-8800b44be306/scratchpad
cd "$SP/pswasm"; rm -rf bin obj
dotnet publish -c Release > rebuild.log 2>&1
B="$SP/pswasm/bin/Release/net8.0/browser-wasm/AppBundle"
HUSK_DEPS="$SP/deps/out" python3 "$HERE/../engine/inject.py" "$B"
