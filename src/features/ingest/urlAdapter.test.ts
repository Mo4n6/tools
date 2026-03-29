import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ingestUrl, UrlIngestError } from './urlAdapter';

function asJsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('ingestUrl', () => {
  const originalFetch = globalThis.fetch;
  const originalDomParser = globalThis.DOMParser;

  beforeAll(() => {
    if (!globalThis.DOMParser) {
      globalThis.DOMParser = new JSDOM('').window.DOMParser;
    }
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    globalThis.DOMParser = originalDomParser;
    vi.restoreAllMocks();
  });

  it('normalizes extract API payload on success and strips unsafe HTML', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      asJsonResponse({
        article: {
          title: 'Fetched title',
          content: '<article><h1>Allowed</h1><script>alert(1)</script></article>',
        },
      }),
    ) as typeof fetch;

    const normalized = await ingestUrl('https://example.com/article');

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/extract', expect.objectContaining({
      method: 'POST',
    }));
    expect(normalized.title).toBe('Fetched title');
    expect(normalized.segments[0]?.text).toContain('Allowed');
    expect(normalized.segments[0]?.text).not.toContain('alert(1)');
  });

  it('maps 404/5xx responses to URL_EXTRACT_UNAVAILABLE', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      asJsonResponse({ message: 'missing' }, { status: 404 }),
    ) as typeof fetch;

    await expect(ingestUrl('https://example.com/missing')).rejects.toMatchObject<UrlIngestError>({
      code: 'URL_EXTRACT_UNAVAILABLE',
    });
  });

  it('maps non-404 client errors to URL_EXTRACT_FAILED', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      asJsonResponse({ message: 'bad request' }, { status: 422 }),
    ) as typeof fetch;

    await expect(ingestUrl('https://example.com/blocked')).rejects.toMatchObject<UrlIngestError>({
      code: 'URL_EXTRACT_FAILED',
    });
  });

  it('maps fetch failures to URL_EXTRACT_UNAVAILABLE', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as typeof fetch;

    await expect(ingestUrl('https://example.com/offline')).rejects.toMatchObject<UrlIngestError>({
      code: 'URL_EXTRACT_UNAVAILABLE',
    });
  });
});
