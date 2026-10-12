// Husk wasm spike — host boundary.
//
// The interception below has to happen BEFORE dotnet.create(), because .NET's
// browser HTTP stack binds whatever `fetch` is on globalThis at startup. After
// that, every Invoke-WebRequest, DownloadString and HttpClient call in
// PowerShell goes through this function, and nothing in .NET can reach around
// it — the boundary is below the CLR, not beside it.

const hostLog = [];
let seq = 0;

/** Default: record and refuse. The analyst opts in to a live fetch. */
let networkMode = 'blocked';

const realFetch = globalThis.fetch.bind(globalThis);

// The runtime fetches its own assemblies through the same function, so those
// have to pass through untouched or nothing boots.
//
// Scoped by URL, not by file extension. The first version allowed anything
// ending in .js, .json, .dll or .wasm, which let a sample reach the real
// network just by naming its stage `stage2.js` - the one thing this boundary
// exists to prevent. The engine's own directory is the only thing that may
// pass, and it is computed from this module's own location rather than
// hardcoded, so it stays right wherever the bundle is deployed.
const engineBase = new URL('./', import.meta.url).href;

const isRuntimeAsset = (url) => {
  try {
    return new URL(url, globalThis.location?.href ?? engineBase).href.startsWith(engineBase);
  } catch {
    // An unparseable URL is not the runtime's, so it goes through the hook.
    return false;
  }
};

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input
    : (input instanceof URL ? input.href : input?.url ?? String(input));

  if (isRuntimeAsset(url)) {
    return realFetch(input, init);
  }

  const entry = {
    seq: seq++,
    op: 'network.http',
    method: (init?.method ?? (typeof input === 'object' ? input?.method : null) ?? 'GET').toUpperCase(),
    url,
    at: Date.now(),
    outcome: networkMode,
  };
  hostLog.push(entry);

  if (networkMode === 'live') {
    try {
      const response = await realFetch(input, init);
      entry.status = response.status;
      return response;
    } catch (err) {
      entry.outcome = 'error';
      entry.error = String(err).slice(0, 200);
      throw err;
    }
  }

  // A typed absence rather than an empty 200: an empty body that is not
  // flagged reads as "the server returned nothing", which is a different and
  // wrong conclusion. 523 is unused by convention, so it cannot be mistaken
  // for something the C2 actually said.
  return new Response('', {
    status: 523,
    statusText: 'Husk: network blocked',
    headers: { 'X-Husk-Blocked': '1' },
  });
};

const { dotnet } = await import('./_framework/dotnet.js');
const { getAssemblyExports, getConfig } = await dotnet.create();
const e = await getAssemblyExports(getConfig().mainAssemblyName);

globalThis.psInit = () => e.Spike.Init();
globalThis.runPs = (s) => e.Spike.Run(s);
globalThis.runFixture = (s) => JSON.parse(e.Spike.RunFixture(s));
globalThis.cmdletCount = () => e.Spike.CmdletCount();
globalThis.envProbe = () => e.Spike.EnvProbe();
globalThis.threadProbe = () => e.Spike.ThreadProbe();

globalThis.snapshotFs = () => e.Spike.SnapshotFs();
globalThis.droppedFiles = () => JSON.parse(e.Spike.DroppedFiles());
globalThis.readDropped = (path) => e.Spike.ReadDropped(path);

globalThis.proxyCalls = () => JSON.parse(e.Spike.ProxyCalls());
globalThis.registryDump = () => JSON.parse(e.Spike.RegistryDump());
globalThis.setBudget = (steps, ms) => e.Spike.SetBudget(steps, ms);

/** Both layers in one timeline: proxy records first, boundary records under. */
globalThis.hostCalls = () => {
  const proxied = JSON.parse(e.Spike.ProxyCalls());
  return [...proxied, ...hostLog.map((h) => ({ ...h, source: 'boundary' }))];
};
globalThis.setNetworkMode = (mode) => {
  if (mode !== 'blocked' && mode !== 'live') {
    throw new Error(`unknown network mode: ${mode}`);
  }
  networkMode = mode;
  // One switch, not two: the engine's own resolver asks before it reaches for
  // the network, and it must agree with the boundary that wraps fetch.
  e.Spike.SetNetworkLive(mode === 'live');
  return networkMode;
};

globalThis.resetDownloads = () => e.Spike.ResetDownloads();

/**
 * Empty the boundary ledger.
 *
 * `proxyCalls()` drains the C# records and this is its other half, which was
 * missing: `hostCalls()` concatenates both, so without this every later run in
 * a reused engine re-emitted the previous sample's network records and its
 * URLs turned up in the next sample's IOC list. A report belongs to one
 * sample - the same reason the C# ledger really drains instead of copying.
 */
globalThis.drainBoundary = () => {
  const drained = hostLog.length;
  hostLog.length = 0;
  return drained;
};

/**
 * Give the engine a body to serve for a URL the sample asks for.
 *
 * The key is a whole URL, a bare filename, or '*' for anything. Filenames and
 * the wildcard exist because a sample usually builds its URL at runtime with
 * a random host or query, so the only part an analyst can key on in advance
 * is the name - or nothing at all.
 */
globalThis.supplyDownload = (key, content) => {
  const bytes =
    typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
  e.Spike.SupplyDownload(String(key ?? '*'), bytes);
  return bytes.length;
};

/**
 * A synchronous download, for the engine's web proxies.
 *
 * Synchronous on purpose and unavoidably: PowerShell's DownloadString is a
 * synchronous call, the runspace is single-threaded on this thread, and
 * blocking on an async fetch would deadlock the thread that fetch needs in
 * order to finish. Synchronous XHR is forbidden on a document but allowed in
 * a worker, which is where the engine runs.
 *
 * Returns an empty array when nothing arrived, and records why against the
 * boundary - the only layer that sees the actual response.
 *
 * Worth being blunt about what this cannot do: a cross-origin read needs the
 * server to send Access-Control-Allow-Origin, and C2 infrastructure does not,
 * so for most real URLs the browser refuses this before it leaves the tab.
 * That is why supplyDownload is the primary path and this is the exception.
 */
globalThis.huskFetchSync = (url, method) => {
  const entry = {
    seq: seq++,
    op: 'network.http',
    method: (method || 'GET').toUpperCase(),
    url,
    at: Date.now(),
    outcome: networkMode,
    via: 'xhr-sync',
  };
  hostLog.push(entry);

  if (networkMode !== 'live') {
    entry.outcome = 'blocked';
    return new Uint8Array(0);
  }

  try {
    const x = new XMLHttpRequest();
    x.open(entry.method, url, false);

    // Allowed in a worker, throws on a document - and this module is also
    // loaded by the dev harness page. Falling back to text keeps that case
    // working; it would mangle a binary stage, which the harness never has.
    let binary = true;
    try {
      x.responseType = 'arraybuffer';
    } catch {
      binary = false;
    }

    x.send(null);
    entry.status = x.status;

    // A 404 page is not stage 2. Returning its body let a cradle IEX an error
    // page, which shows up as spurious layers and parse errors rather than as
    // the failure WebClient would have raised. The status is recorded either
    // way, so the attempt is still visible.
    if (x.status < 200 || x.status >= 300) {
      entry.outcome = 'http ' + x.status;
      return new Uint8Array(0);
    }

    const bytes =
      binary && x.response
        ? new Uint8Array(x.response)
        : new TextEncoder().encode(x.responseText ?? '');
    entry.bytes = bytes.length;
    if (!binary) entry.note = 'read as text: no worker context';
    return bytes;
  } catch (err) {
    // The CORS refusal lands here, as a NetworkError with no detail - the
    // browser deliberately does not say more. Recorded as what it is.
    entry.outcome = 'error';
    entry.error = String(err).slice(0, 200);
    return new Uint8Array(0);
  }
};

/**
 * Hand a dropped file to the analyst.
 *
 * The `.malware` suffix is appended rather than replacing the extension, so
 * the original name stays readable in a ticket while the file cannot be
 * double-clicked into running. Keep both facts: `payload.exe` is evidence,
 * `payload.exe.malware` is safe to sit in a Downloads folder.
 */
globalThis.saveDropped = (path) => {
  const bytes = e.Spike.ReadDropped(path);
  const name = (path.split('/').pop() || 'dropped') + '.malware';
  const url = URL.createObjectURL(
    new Blob([bytes], { type: 'application/octet-stream' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke late: some browsers abort the download if the URL dies first.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { name, bytes: bytes.length };
};

console.log('READY');
