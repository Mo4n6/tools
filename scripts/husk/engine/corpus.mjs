// Run a directory of real samples through the wasm PowerShell engine and report
// where it falls short. The engine counterpart to run-local-corpus.mjs, which
// does the same for the tree-walker.
//
// The engine *executes* the sample, where the tree-walker only reads it, so the
// two fail in different ways and the comparison is the point. Network stays
// blocked and the filesystem, registry and process APIs are all proxied, so a
// sample runs against stand-ins.
//
// Three things here are scars, not style:
//
//   1. Errors are serialised by hand. A sample that calls exit() throws
//      {name:"ExitStatus"}, which String()ed to "[object Object]" and hid the
//      one event that mattered.
//   2. Health is probed after every failure. The runspace is single-threaded,
//      so a sample that leaves a pipeline running makes every later script fail
//      with "a pipeline is already running" and nothing recovers. One sample
//      did this at index 94 of 300 and silently invalidated the next 206 rows -
//      a 69% harness artifact reported as an engine failure rate.
//   3. Rows are written every iteration. The first version wrote once at the
//      end, so a dead browser took the whole run with it.
//
// Usage:
//   ENGINE_DIR=/path/to/built/engine \
//   HUSK_CHROME=/path/to/chrome \
//   node scripts/husk/engine/corpus.mjs <list-file> [limit] [out.jsonl]
//
// <list-file> is one sample path per line. Build one with `find ... -name '*.ps1'`.
//
// SPDX-License-Identifier: MIT

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

import { decodeSource } from "../sample-encoding.mjs";

const ENGINE = process.env.ENGINE_DIR;
const LIST = process.argv[2];
const LIMIT = Number(process.argv[3] ?? 25);
const OUT = process.argv[4];
const PER_SAMPLE_MS = Number(process.env.PER_SAMPLE_MS ?? 20000);

const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".wasm": "application/wasm", ".html": "text/html", ".dat": "application/octet-stream",
  ".pdb": "application/octet-stream", ".txt": "text/plain" };

const engine = createServer((q, r) => {
  const rel = decodeURIComponent(q.url.split("?")[0]);
  // The bundle ships no HTML shell; the engine is main.js as a module.
  if (rel === "/") {
    r.writeHead(200, { "content-type": "text/html",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-embedder-policy": "require-corp" });
    return r.end('<!doctype html><meta charset=utf-8><script type="module" src="./main.js"></script>');
  }
  const file = join(ENGINE, rel);
  try {
    const body = readFileSync(file);
    r.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" });
    r.end(body);
  } catch { r.writeHead(404).end("no"); }
});
await new Promise((ok) => engine.listen(4251, () => ok(undefined)));


const browser = await chromium.launch({ executablePath: process.env.HUSK_CHROME });

/** A page with the engine booted and budgeted, ready for one sample. */
async function newPage() {
  const made = await browser.newPage();
  made.on("pageerror", (e) => process.stderr.write(`  [pageerror] ${String(e).slice(0, 180)}\n`));
  made.on("console", (m) => {
    if (m.type() === "error") process.stderr.write(`  [console] ${m.text().slice(0, 180)}\n`);
  });
  await made.goto("http://localhost:4251/", { waitUntil: "domcontentloaded" });
  await made.waitForFunction(() => typeof globalThis.runFixture === "function", null, {
    timeout: 180000,
  });
  await made.evaluate(() => globalThis.psInit());
  await made.evaluate(() => globalThis.setBudget(4000000, 10000));
  return made;
}

let page = await newPage();

/** Replace a wedged engine. The old page is closed best-effort. */
async function fresh() {
  await page.close().catch(() => {});
  page = await newPage();
}

const list = readFileSync(LIST, "utf8").trim().split("\n").slice(0, LIMIT);
const rows = [];
let n = 0;
for (const p of list) {
  n += 1;
  const name = p.split("/").pop().slice(0, 12);
  let src;
  try { src = decodeSource(readFileSync(p)); } catch { continue; }
  const started = Date.now();
  let row = { name, status: "ok", ms: 0, calls: 0, dropped: 0, err: "", out: 0 };
  try {
    const got = await Promise.race([
      page.evaluate((s) => {
        globalThis.resetDownloads();
        globalThis.setNetworkMode("blocked");
        globalThis.proxyCalls(); globalThis.drainBoundary(); globalThis.snapshotFs();
        const show = (v) =>
          typeof v === "string" ? v
          : v instanceof Error ? `${v.name}: ${v.message}`
          : (() => { try { return JSON.stringify(v); } catch { return Object.prototype.toString.call(v); } })();
        let r, threw = "";
        try { r = globalThis.runFixture(s); } catch (e) { threw = show(e).slice(0, 300); }
        const calls = globalThis.hostCalls();
        const dropped = globalThis.droppedFiles();
        globalThis.proxyCalls();
        return { r, calls, dropped, threw };
      }, src),
      new Promise((_, bad) => setTimeout(() => bad(new Error("TIMEOUT")), PER_SAMPLE_MS)),
    ]);
    row.ms = Date.now() - started;
    row.calls = (got.calls ?? []).length;
    row.dropped = (got.dropped ?? []).length;
    row.out = (got.r?.output ?? got.r?.Output ?? "").length;
    const e = got.threw || got.r?.error || got.r?.Error || "";
    if (e) {
      row.status = "error";
      row.err = (typeof e === "string" ? e : JSON.stringify(e)).replace(/\s+/g, " ").slice(0, 200);
    }
  } catch (e) {
    row.ms = Date.now() - started;
    row.status = String(e.message).includes("TIMEOUT") ? "timeout" : "dead";
    row.err = String(e.message).replace(/\s+/g, " ").slice(0, 160);
    await fresh();  // a dead worker must not abort the whole run
  }
  if (row.status !== "ok") {
    let healthy = false;
    try {
      healthy = await Promise.race([
        page.evaluate(() => {
          try { const r = globalThis.runFixture("1"); return !(r?.error || r?.Error); }
          catch { return false; }
        }),
        new Promise((ok) => setTimeout(() => ok(false), 10000)),
      ]);
    } catch { healthy = false; }
    if (!healthy) {
      row.wedged = true;
      await fresh();
    }
  }
  rows.push(row);
  // Written every iteration: the first version only wrote at the end, so a
  // browser that died took the whole run's results with it.
  writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  process.stderr.write(
    `  [${n}/${list.length}] ${row.status.padEnd(7)} ${row.ms}ms${row.wedged ? " RESET" : ""} ${name}\n`,
  );
}
await browser.close(); engine.close();
