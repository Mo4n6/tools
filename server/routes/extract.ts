import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';

const REQUEST_SCHEMA = z.object({
  url: z.string().url(),
});

const SUCCESS_SCHEMA = z.object({
  title: z.string().min(1),
  byline: z.string().min(1).optional(),
  textContent: z.string().min(1),
  excerpt: z.string().min(1).optional(),
  siteName: z.string().min(1).optional(),
});

const ERROR_SCHEMA = z.object({
  error: z.object({
    code: z.enum(['INVALID_URL', 'BLOCKED_HOST', 'FETCH_TIMEOUT', 'UNREADABLE_CONTENT']),
    message: z.string(),
  }),
});

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_SIZE_BYTES = 2 * 1024 * 1024;

const BLOCKED_CIDR_V4: Array<[number, number]> = [
  [toV4Int('0.0.0.0'), 8],
  [toV4Int('10.0.0.0'), 8],
  [toV4Int('127.0.0.0'), 8],
  [toV4Int('169.254.0.0'), 16],
  [toV4Int('172.16.0.0'), 12],
  [toV4Int('192.168.0.0'), 16],
];

const BLOCKED_CIDR_V6: Array<[bigint, number]> = [
  [toV6BigInt('::1'), 128],
  [toV6BigInt('::'), 128],
  [toV6BigInt('fe80::'), 10],
  [toV6BigInt('fc00::'), 7],
];

class ExtractRouteError extends Error {
  constructor(
    public readonly code: 'INVALID_URL' | 'BLOCKED_HOST' | 'FETCH_TIMEOUT' | 'UNREADABLE_CONTENT',
    message: string,
  ) {
    super(message);
  }
}

export async function extractRoute(request: Request): Promise<Response> {
  try {
    const rawBody = await request.json();
    const { url } = REQUEST_SCHEMA.parse(rawBody);

    const validatedUrl = parseAndValidateHttpUrl(url);
    const html = await fetchHtmlWithGuards(validatedUrl, MAX_REDIRECTS);

    const article = new Readability(new JSDOM(html, { url: validatedUrl.toString() }).window.document).parse();

    if (!article?.title || !article.textContent?.trim()) {
      throw new ExtractRouteError('UNREADABLE_CONTENT', 'Unable to extract readable content.');
    }

    const payload = SUCCESS_SCHEMA.parse({
      title: article.title,
      byline: article.byline ?? undefined,
      textContent: article.textContent.trim(),
      excerpt: article.excerpt ?? undefined,
      siteName: article.siteName ?? undefined,
    });

    return jsonResponse(payload, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonResponse(
        ERROR_SCHEMA.parse({
          error: { code: 'INVALID_URL', message: 'Request body must contain a valid http/https URL.' },
        }),
        400,
      );
    }

    if (error instanceof ExtractRouteError) {
      const status = error.code === 'FETCH_TIMEOUT' ? 504 : 422;
      return jsonResponse(ERROR_SCHEMA.parse({ error: { code: error.code, message: error.message } }), status);
    }

    return jsonResponse(
      ERROR_SCHEMA.parse({
        error: { code: 'UNREADABLE_CONTENT', message: 'Content could not be fetched or parsed safely.' },
      }),
      422,
    );
  }
}

function parseAndValidateHttpUrl(input: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new ExtractRouteError('INVALID_URL', 'Malformed URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ExtractRouteError('INVALID_URL', 'Only http/https URLs are allowed.');
  }

  return parsed;
}

async function fetchHtmlWithGuards(startUrl: URL, maxRedirects: number): Promise<string> {
  let currentUrl = startUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    await blockPrivateHosts(currentUrl.hostname);

    const response = await guardedFetch(currentUrl);

    if (isRedirect(response.status)) {
      const locationHeader = response.headers.get('location');
      if (!locationHeader) {
        throw new ExtractRouteError('UNREADABLE_CONTENT', 'Redirect response is missing location header.');
      }

      if (redirectCount === maxRedirects) {
        throw new ExtractRouteError('UNREADABLE_CONTENT', 'Maximum redirects exceeded.');
      }

      currentUrl = parseAndValidateHttpUrl(new URL(locationHeader, currentUrl).toString());
      continue;
    }

    if (!response.ok) {
      throw new ExtractRouteError('UNREADABLE_CONTENT', `Origin responded with status ${response.status}.`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
      throw new ExtractRouteError('UNREADABLE_CONTENT', 'Response is not HTML content.');
    }

    return readResponseBodyWithLimit(response, MAX_RESPONSE_SIZE_BYTES);
  }

  throw new ExtractRouteError('UNREADABLE_CONTENT', 'Unable to fetch document after redirects.');
}

async function guardedFetch(url: URL): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'ReaderWorkbenchBot/1.0',
      },
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new ExtractRouteError('FETCH_TIMEOUT', `Request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    }

    throw new ExtractRouteError('UNREADABLE_CONTENT', 'Fetch failed.');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readResponseBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    throw new ExtractRouteError('UNREADABLE_CONTENT', 'Response body is empty.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.byteLength;
    if (total > maxBytes) {
      throw new ExtractRouteError('UNREADABLE_CONTENT', `Response exceeded ${maxBytes} bytes.`);
    }

    output += decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
}

async function blockPrivateHosts(hostname: string): Promise<void> {
  const literalVersion = isIP(hostname);

  if (literalVersion !== 0) {
    if (isBlockedIp(hostname)) {
      throw new ExtractRouteError('BLOCKED_HOST', 'Target host resolves to a blocked IP range.');
    }
    return;
  }

  let records: Awaited<ReturnType<typeof lookup>>[];
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ExtractRouteError('UNREADABLE_CONTENT', 'Unable to resolve hostname.');
  }

  if (records.length === 0) {
    throw new ExtractRouteError('UNREADABLE_CONTENT', 'Hostname resolved with no records.');
  }

  if (records.some((record) => isBlockedIp(record.address))) {
    throw new ExtractRouteError('BLOCKED_HOST', 'Target host resolves to a blocked IP range.');
  }
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isBlockedIp(address: string): boolean {
  if (isIPv4(address)) {
    const ip = toV4Int(address);
    return BLOCKED_CIDR_V4.some(([network, prefix]) => matchesV4Cidr(ip, network, prefix));
  }

  const embeddedV4 = extractEmbeddedIPv4(address);
  if (embeddedV4) {
    const ip = toV4Int(embeddedV4);
    return BLOCKED_CIDR_V4.some(([network, prefix]) => matchesV4Cidr(ip, network, prefix));
  }

  if (isIPv6(address)) {
    const ip = toV6BigInt(address);
    return BLOCKED_CIDR_V6.some(([network, prefix]) => matchesV6Cidr(ip, network, prefix));
  }

  return true;
}


function extractEmbeddedIPv4(address: string): string | null {
  const match = address.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (!match) return null;
  return isIPv4(match[1]) ? match[1] : null;
}

function isIPv4(address: string): boolean {
  return isIP(address) === 4;
}

function isIPv6(address: string): boolean {
  return isIP(address) === 6;
}

function toV4Int(address: string): number {
  const [a, b, c, d] = address.split('.').map((part) => Number.parseInt(part, 10));
  return (((a << 24) >>> 0) + (b << 16) + (c << 8) + d) >>> 0;
}

function matchesV4Cidr(ip: number, network: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ip & mask) === (network & mask);
}

function toV6BigInt(address: string): bigint {
  const expanded = expandIPv6(address);
  return expanded.reduce((acc, part) => (acc << 16n) + BigInt(part), 0n);
}

function expandIPv6(address: string): number[] {
  const [headRaw, tailRaw] = address.split('::');
  const head = headRaw ? headRaw.split(':').filter(Boolean) : [];
  const tail = tailRaw ? tailRaw.split(':').filter(Boolean) : [];

  const normalize = (parts: string[]): string[] => {
    if (parts.length === 0) return parts;
    const last = parts[parts.length - 1];
    if (!last.includes('.')) return parts;

    const ipv4 = extractEmbeddedIPv4(last);
    if (!ipv4) return parts;

    const value = toV4Int(ipv4);
    return [...parts.slice(0, -1), ((value >>> 16) & 0xffff).toString(16), (value & 0xffff).toString(16)];
  };

  const normalizedHead = normalize(head);
  const normalizedTail = normalize(tail);

  const missing = 8 - (normalizedHead.length + normalizedTail.length);
  const middle = missing > 0 ? new Array(missing).fill('0') : [];

  const parts = [...normalizedHead, ...middle, ...normalizedTail];
  return parts.map((part) => Number.parseInt(part, 16));
}

function matchesV6Cidr(ip: bigint, network: bigint, prefix: number): boolean {
  const fullMask = (1n << 128n) - 1n;
  const shift = 128n - BigInt(prefix);
  const mask = shift === 128n ? 0n : (fullMask << shift) & fullMask;
  return (ip & mask) === (network & mask);
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const extractSchemas = {
  request: REQUEST_SCHEMA,
  success: SUCCESS_SCHEMA,
  error: ERROR_SCHEMA,
};
