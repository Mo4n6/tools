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
const isRuntimeAsset = (url) =>
  url.includes('/_framework/') || url.endsWith('.dll') ||
  url.endsWith('.wasm') || url.endsWith('.dat') ||
  url.endsWith('.js') || url.endsWith('.json') || url.endsWith('.symbols');

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
  return networkMode;
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
