import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { markdownFixture, plainTextFixture } from '../../domain/normalize/__fixtures__/index.fixture';
import { ingestFile, sanitizeFilePreviewHtml } from './fileAdapter';

describe('ingestFile html handling', () => {
  const originalDomParser = globalThis.DOMParser;
  const originalWindow = globalThis.window;
  const originalElement = globalThis.Element;
  let jsdom: JSDOM | null = null;

  beforeAll(() => {
    jsdom = new JSDOM('');

    if (!globalThis.window) {
      Object.assign(globalThis, { window: jsdom.window });
    }
    if (!globalThis.Element) {
      Object.assign(globalThis, { Element: jsdom.window.Element });
    }

    if (!globalThis.DOMParser) {
      globalThis.DOMParser = jsdom.window.DOMParser;
    }
  });

  afterAll(() => {
    globalThis.DOMParser = originalDomParser;
    if (originalWindow) {
      Object.assign(globalThis, { window: originalWindow });
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
    if (originalElement) {
      Object.assign(globalThis, { Element: originalElement });
    } else {
      Reflect.deleteProperty(globalThis, 'Element');
    }
    jsdom?.window.close();
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

  it('treats text/html content types with charset metadata as html', async () => {
    const html = '<html><head><title>Charset</title></head><body><p>Parsed as HTML.</p></body></html>';
    const file = new File([html], 'sample.txt', { type: 'text/html;charset=utf-8' });

    const normalized = await ingestFile(file);

    expect(normalized.title).toBe('Charset');
    expect(normalized.segments[0]?.text).toContain('Parsed as HTML.');
  });

  it('handles malformed html input without throwing', async () => {
    const malformed = '<html><head><title>Broken</title></head><body><div><p>Open tags only';
    const file = new File([malformed], 'broken.htm', { type: 'text/html' });

    const normalized = await ingestFile(file);

    expect(normalized.title).toBe('Broken');
    expect(normalized.segments).toHaveLength(1);
    expect(normalized.segments[0]?.text).toContain('Open tags only');
  });

  it('drops script/style-like body content before normalization', async () => {
    const html = `
      <html>
        <head><title>Filtered</title></head>
        <body>
          <h1>Readable text</h1>
          <script>window.alert('xss')</script>
          <style>body { display: none; }</style>
          <noscript>noscript should not be included</noscript>
        </body>
      </html>
    `;

    const file = new File([html], 'filtered.html', { type: 'text/html' });
    const normalized = await ingestFile(file);
    const text = normalized.segments[0]?.text ?? '';

    expect(text).toContain('Readable text');
    expect(text).not.toContain('window.alert');
    expect(text).not.toContain('display: none');
    expect(text).not.toContain('noscript should not be included');
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

describe('ingestFile type routing and validation', () => {
  it('normalizes plain text files', async () => {
    const file = new File([plainTextFixture], 'article.txt', { type: 'text/plain' });

    const normalized = await ingestFile(file);

    expect(normalized.segments.length).toBeGreaterThan(1);
    expect(normalized.segments[0]?.text).toContain('First paragraph has extra spaces.');
  });

  it('normalizes markdown files by extension', async () => {
    const file = new File([markdownFixture], 'notes.md', { type: 'application/octet-stream' });

    const normalized = await ingestFile(file);

    expect(normalized.title).toBeUndefined();
    expect(normalized.segments.length).toBeGreaterThan(0);
    const joined = normalized.segments.map((segment) => segment.text).join(' ');

    expect(joined).toContain('Main Title');
    expect(joined).not.toContain('Heading level');
    expect(joined).not.toContain('Bullet:');
    expect(joined).not.toContain('Numbered item');
  });

  it('throws UNSUPPORTED_FILE_TYPE for unsupported file types', async () => {
    const file = new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' });

    await expect(ingestFile(file)).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE_TYPE',
      fileName: 'report.pdf',
    });
  });

  it('throws BINARY_FILE_CONTENT when control characters are detected', async () => {
    const file = new File(['\u0000\u0007'], 'binary.txt', { type: 'text/plain' });

    await expect(ingestFile(file)).rejects.toMatchObject({
      code: 'BINARY_FILE_CONTENT',
      fileName: 'binary.txt',
    });
  });
});
