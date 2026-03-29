import { execFileSync } from 'node:child_process';

const targetUrl = process.argv[2];

if (!targetUrl) {
  console.error('Usage: node scripts/check-deployed-assets.mjs <deployed-app-url>');
  process.exit(1);
}

const normalizeUrl = (value) => {
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
};

const rootUrl = normalizeUrl(targetUrl);
if (!rootUrl) {
  console.error(`Invalid URL: ${targetUrl}`);
  process.exit(1);
}

const curlFetch = (url) => {
  const response = execFileSync(
    'curl',
    ['-sS', '-L', '--max-redirs', '10', '--write-out', '\n%{url_effective}\n%{http_code}', url],
    { encoding: 'utf8' },
  );

  const parts = response.split('\n');
  const status = Number(parts.at(-1));
  const effectiveUrl = parts.at(-2) ?? url;
  const body = parts.slice(0, -2).join('\n');
  return { body, effectiveUrl, status, ok: status >= 200 && status < 300 };
};

const htmlResponse = curlFetch(rootUrl);
if (!htmlResponse.ok) {
  console.error(`Failed to fetch app URL (${htmlResponse.status}): ${rootUrl}`);
  process.exit(1);
}

const html = htmlResponse.body;
const effectiveUrl = htmlResponse.effectiveUrl;
const chunkRegex = /<(?:script[^>]*\ssrc|link[^>]*\shref)=['\"]([^'\"]+)['\"][^>]*>/gi;

const rawChunkRefs = new Set();
for (const match of html.matchAll(chunkRegex)) {
  const maybePath = match[1];
  if (!maybePath || maybePath.startsWith('data:')) {
    continue;
  }

  if (!maybePath.includes('/assets/') || !/\.(?:js|css)(?:\?|#|$)/i.test(maybePath)) {
    continue;
  }

  rawChunkRefs.add(maybePath);
}

const chunkUrls = [...rawChunkRefs].map((ref) => new URL(ref, effectiveUrl).toString());
if (chunkUrls.length === 0) {
  console.error(`No JS/CSS chunk URLs were discovered in ${effectiveUrl}`);
  process.exit(1);
}

const results = chunkUrls.map((chunkUrl) => {
  const response = curlFetch(chunkUrl);
  return { chunkUrl: response.effectiveUrl, status: response.status, ok: response.ok };
});

const failed = results.filter((entry) => !entry.ok);
for (const result of results) {
  const marker = result.ok ? '✅' : '❌';
  console.log(`${marker} ${result.status} ${result.chunkUrl}`);
}

if (failed.length > 0) {
  console.error(`Detected ${failed.length} failing chunk request(s).`);
  process.exit(1);
}

console.log(`\nDeployed asset check passed for ${effectiveUrl}`);
