// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Husk capture probe: what each layer sees, line by line.
//
// Four layers record host calls, and each has a different blind spot — the
// binder cannot see inside a cmdlet, the cmdlet layer cannot see a .NET call,
// a proxy function can be deleted, the fetch boundary sees only what reaches
// the network. The only way to know a layer still works is to run a line that
// only that layer can see and check the record came out. That is this.
//
// Run it against a published bundle (see rebuild.sh):
//
//   HUSK_BUNDLE=<…>/browser-wasm/AppBundle \
//   HUSK_CHROME=/opt/pw-browsers/chromium-*/chrome-linux/chrome \
//   node scripts/husk/wasm-spike/capture-probe.mjs \
//     scripts/husk/wasm-spike/probes/host-calls.ps1
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
const server = createServer((q, r) => {
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
  r.writeHead(200, {
    "Content-Type": T[extname(f)] ?? "application/octet-stream",
  });
  r.end(readFileSync(f));
});
await new Promise((ready) => server.listen(4228, () => ready(undefined)));
const b = await chromium.launch({ executablePath: process.env.HUSK_CHROME });
const page = await b.newPage();
await page.goto("http://localhost:4228/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => typeof globalThis.hostCalls === "function",
  null,
  { timeout: 180000 },
);
console.log(
  "init:",
  String(await page.evaluate(() => globalThis.psInit())).trim(),
);
const lines = readFileSync(process.argv[2], "utf8").split("\n");
for (const line of lines) {
  const src = line.trim();
  if (!src || src.startsWith("#")) continue;
  const r = await page.evaluate((s) => globalThis.runFixture(s), src);
  const calls = await page.evaluate(() => globalThis.hostCalls());
  console.log(`\n> ${src}`);
  if (r.error) console.log(`  ERROR : ${r.error.slice(0, 140)}`);
  if (r.output)
    console.log(`  out   : ${r.output.replace(/\n/g, " ").slice(0, 100)}`);
  for (const c of calls)
    console.log(
      `  CALL  : [${c.source}] ${c.op} <- ${c.native} ${JSON.stringify(c.args).slice(0, 130)}`,
    );
  if (!calls.length) console.log("  CALL  : (none)");
  await page.evaluate(() => globalThis.proxyCalls());
}
await b.close();
server.close();
process.exit(0);
