set -e
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
SP=/tmp/claude-0/-home-user-tools/f3a22558-a597-5b7f-9b79-8800b44be306/scratchpad
cd "$SP/pswasm"; rm -rf bin obj
dotnet publish -c Release > rebuild.log 2>&1
B="$SP/pswasm/bin/Release/net8.0/browser-wasm/AppBundle"
python3 - "$B" "$SP/deps/out" <<'PY'
import base64, hashlib, json, os, shutil, sys
B, SRC = sys.argv[1], sys.argv[2]
fw=os.path.join(B,'_framework'); boot=os.path.join(fw,'blazor.boot.json')
d=json.load(open(boot)); asm=d['resources']['assembly']; n=0
# Left out deliberately. Roslyn alone is 10.6 MB gzipped - 86% of the bundle -
# and it exists for Add-Type, which cannot work in a browser: the cmdlet's type
# initializer throws on wasm even with Roslyn present, and the P/Invoke
# declarations samples write it for have no native library to reach. A proxy
# records the C# source and the imports it declares instead, which is the part
# an analyst wants. The rest are cmdlets no sample uses, dragging in graphics,
# markdown and graphics.
#
# Microsoft.ApplicationInsights stays, though telemetry is opted out: SMA holds
# a static field of a type from it, and the field's type has to load for the
# class to initialise at all. Measured by removing it - Init failed with
# "could not load type of field ...<s_telemetryClient>k__BackingField".
SKIP = {
    'Microsoft.CodeAnalysis.dll',            # Roslyn, for Add-Type
    'Microsoft.CodeAnalysis.CSharp.dll',     # Roslyn, for Add-Type
    'Humanizer.dll',                         # Roslyn's
    # The app references the patched SMA by file name, so the wasm SDK bundles
    # it under that name AND the injection below writes it under its assembly
    # name. Both end up in the manifest and the loader downloads 2 MB twice.
    'SMA-unix.dll',
}
if os.environ.get('HUSK_NO_SKIP'):
    SKIP = {'SMA-unix.dll'}
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.dll') or f=='deps.dll': continue
    if f in SKIP: continue
    if f in asm and f!='System.Management.Automation.dll': continue
    dst=os.path.join(fw,f); shutil.copyfile(os.path.join(SRC,f),dst)
    asm[f]='sha256-'+base64.b64encode(hashlib.sha256(open(dst,'rb').read()).digest()).decode(); n+=1
# Already in the bundle from a previous publish, or pulled in by the runtime
# pack: drop them from the manifest too, or the loader fetches them anyway.
removed = 0
for f in SKIP:
    if f in asm:
        del asm[f]; removed += 1
    path = os.path.join(fw, f)
    if os.path.exists(path): os.remove(path)

json.dump(d,open(boot,'w'),indent=2)
print('injected',n,'assemblies; skipped',len(SKIP),'(',removed,'from the manifest ); total',len(asm))
PY
