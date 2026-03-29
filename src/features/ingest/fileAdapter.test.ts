import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ingestFile, sanitizeFilePreviewHtml } from './fileAdapter';

describe('ingestFile html handling', () => {
  const originalDomParser = globalThis.DOMParser;

  beforeAll(() => {
    if (!globalThis.DOMParser) {
      globalThis.DOMParser = new JSDOM('').window.DOMParser;
    }
  });

  afterAll(() => {
    globalThis.DOMParser = originalDomParser;
  });

  it('parses a valid html file into readable normalized text', async () => {
    const html = `
      <!doctype html>
      <html>
        <head><title>My Sample Article</title></head>
        <body>
          <h1>Hello World</h1>
          <p>First paragraph.</p>
          <p>Second paragraph.</p>
        </body>
      </html>
    `;

    const file = new File([html], 'sample.html', { type: 'text/html' });
    const normalized = await ingestFile(file);

    expect(normalized.title).toBe('My Sample Article');
    expect(normalized.segments).toHaveLength(1);
    expect(normalized.segments[0]?.text).toContain('Hello World');
    expect(normalized.segments[0]?.text).toContain('First paragraph.');
    expect(normalized.segments[0]?.text).toContain('Second paragraph.');
  });

  it('handles malformed html input without throwing', async () => {
    const malformed = '<html><head><title>Broken</title></head><body><div><p>Open tags only';
    const file = new File([malformed], 'broken.htm', { type: 'text/html' });

    const normalized = await ingestFile(file);

    expect(normalized.title).toBe('Broken');
    expect(normalized.segments).toHaveLength(1);
    expect(normalized.segments[0]?.text).toContain('Open tags only');
  });

  it('sanitizes html containing scripts for preview rendering', () => {
    const maliciousHtml = `
      <article>
        <h1 onclick="alert('xss')">Unsafe title</h1>
        <script>alert('boom')</script>
        <a href="javascript:alert('xss')">click me</a>
      </article>
    `;

    const sanitizedPreview = sanitizeFilePreviewHtml(maliciousHtml);

    expect(sanitizedPreview).toContain('<article>');
    expect(sanitizedPreview).not.toMatch(/<script/i);
    expect(sanitizedPreview).not.toMatch(/on\w+=/i);
    expect(sanitizedPreview).not.toMatch(/javascript:/i);
  });
});
