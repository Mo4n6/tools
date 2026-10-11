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
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.dll') or f=='deps.dll': continue
    if f in asm and f!='System.Management.Automation.dll': continue
    dst=os.path.join(fw,f); shutil.copyfile(os.path.join(SRC,f),dst)
    asm[f]='sha256-'+base64.b64encode(hashlib.sha256(open(dst,'rb').read()).digest()).decode(); n+=1
json.dump(d,open(boot,'w'),indent=2); print('injected',n,'assemblies; total',len(asm))
PY
