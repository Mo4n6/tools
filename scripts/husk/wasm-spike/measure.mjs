// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Husk engine corpus measurement.
//
// Two metrics, because the engine and the tree-walker produce different things:
//
//   behaviour  — does running the obfuscated sample do what running the
//                ground-truth deobfuscated script does? This is the metric
//                that matters for IOC extraction: the sample's effects, not
//                its source text. The ground truth is executed by the same
//                engine so the comparison is like-for-like.
//   source     — did a layer handed to Invoke-Expression equal the
//                deobfuscated source? This is what the tree-walker measures,
//                and the engine only sees it where the sample uses IEX.
//
// Run it against a published bundle (see rebuild.sh):
//
//   HUSK_BUNDLE=<…>/browser-wasm/AppBundle HUSK_REPO="$PWD" \
//   HUSK_CHROME=/opt/pw-browsers/chromium-*/chrome-linux/chrome \
//   HUSK_OUT=/tmp node scripts/husk/wasm-spike/measure.mjs
//
// HUSK_CHROME is optional; without it Playwright uses its own download.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
// Where `dotnet publish` left the bundle, and where to drop the failure dump.
// Both are build outputs, so they live outside the repo.
const R =
  process.env.HUSK_BUNDLE ??
  `${process.env.HUSK_SPIKE ?? "."}/bin/Release/net8.0/browser-wasm/AppBundle`;
const OUT = process.env.HUSK_OUT ?? ".";
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
await new Promise((ready) => server.listen(4225, () => ready(undefined)));

// Most of the corpus is a launcher command line, not a script. The engine gets
// the script the launcher would have run.
const SW =
  /^\s*-(nop|noprofile|noni|noninteractive|w|windowstyle|hidden|ep|executionpolicy|bypass|sta|mta|nologo|enc|encodedcommand|e|ec|c|command|f|file)\b\s*/i;
function unwrap(src) {
  let s = String(src).trim();
  if (!/^powershell(\.exe)?\b/i.test(s)) return s;
  s = s.replace(/^powershell(\.exe)?\b\s*/i, "");
  const e = s.match(
    /(?:^|\s)-(?:enc|e|ec|encodedcommand)\s+([A-Za-z0-9+/=]{16,})/i,
  );
  if (e) {
    try {
      return Buffer.from(e[1], "base64").toString("utf16le");
    } catch {
      return s;
    }
  }
  let p;
  do {
    p = s;
    s = s.replace(SW, "");
  } while (s !== p);
  s = s.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    // A cmd.exe command line, so the payload inside carries cmd's escaping:
    // \" for a quote and ^X for anything cmd would otherwise act on. Leaving
    // it in place hands the engine literal backslashes and carets, and the
    // sample dies on a command named '\[\'.
    s = s
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\^([|&<>^()"])/g, "$1");
  } else if (s.startsWith("'") && s.endsWith("'")) {
    s = s.slice(1, -1);
  }
  return s;
}

const b = await chromium.launch({ executablePath: process.env.HUSK_CHROME });
const page = await b.newPage();
await page.goto("http://localhost:4225/", { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => typeof globalThis.runFixture === "function",
  null,
  { timeout: 180000 },
);
if (String(await page.evaluate(() => globalThis.psInit())).trim() !== "OK") {
  console.log("init failed");
  process.exit(1);
}
const run = async (src) => {
  try {
    return await Promise.race([
      page.evaluate((s) => globalThis.runFixture(s), src),
      new Promise((x) => setTimeout(() => x(null), 15000)),
    ]);
  } catch {
    return null;
  }
};
console.log("smoke:", JSON.stringify(await run("Write-Host 'WH-WORKS'")));

const norm = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
const low = (s) => norm(s).toLowerCase();
const C =
  (process.env.HUSK_REPO ?? ".") + "/src/features/husk/corpus/fixtures/";
const sets = {
  "single-transform": JSON.parse(
    readFileSync(C + "invoke-obfuscation.json", "utf8"),
  ).fixtures,
  layered: JSON.parse(readFileSync(C + "layered.json", "utf8")).fixtures,
};
const truth = new Map(); // expected source -> what running it does
const fails = [];
for (const [name, fx] of Object.entries(sets)) {
  let beh = 0,
    src = 0,
    err = 0,
    to = 0,
    noTruth = 0;
  const bl = new Map();
  const t0 = Date.now();
  for (const f of fx) {
    if (!truth.has(f.expected)) truth.set(f.expected, await run(f.expected));
    const want = truth.get(f.expected);
    const got = await run(unwrap(f.obfuscated));
    if (got === null) {
      to++;
      fails.push({
        set: name,
        id: f.id,
        err: "TIMEOUT",
        src: unwrap(f.obfuscated),
      });
      continue;
    }
    const sourceHit = (got.layers || []).some(
      (l) => low(l) === low(f.expected) || low(l).includes(low(f.expected)),
    );
    if (sourceHit) src++;
    // Behavioural match needs a ground truth that itself ran cleanly, otherwise
    // there is nothing to compare against and the fixture is unmeasurable.
    if (want === null || want.error) {
      noTruth++;
    } else if (
      !got.error &&
      norm(got.output) === norm(want.output) &&
      (norm(want.output).length > 0 || sourceHit)
    ) {
      beh++;
    } else {
      err++;
      const k = (got.error || "output-differs").slice(0, 70);
      bl.set(k, (bl.get(k) ?? 0) + 1);
      fails.push({
        set: name,
        id: f.id,
        err: got.error || "output-differs",
        out: String(got.output ?? "").slice(0, 160),
        wantOut: String(want.output ?? "").slice(0, 160),
        expected: f.expected,
        layers: (got.layers || []).slice(0, 3),
        src: unwrap(f.obfuscated),
      });
    }
  }
  const pct = (n) => ((n / fx.length) * 100).toFixed(1);
  console.log(
    `\n### ${name}  n=${fx.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
  );
  console.log(`  behaviour reproduced : ${beh} (${pct(beh)}%)`);
  console.log(`  source recovered     : ${src} (${pct(src)}%)`);
  console.log(
    `  missed: ${err}   timeout: ${to}   no ground truth: ${noTruth}`,
  );
  for (const [k, n] of [...bl].sort((a, b) => b[1] - a[1]).slice(0, 8))
    console.log(`     ${String(n).padStart(4)}x ${k}`);
}
writeFileSync(OUT + "/fails.json", JSON.stringify(fails, null, 1));
console.log("\nwrote", fails.length, "failures to", OUT + "/fails.json");
await b.close();
server.close();
process.exit(0);
