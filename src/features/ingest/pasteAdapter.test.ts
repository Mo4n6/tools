import { describe, expect, it } from 'vitest';
import { ingestPastedText } from './pasteAdapter';

describe('ingestPastedText', () => {
  it('detects markdown paste and applies plain markdown reading policy', async () => {
    const markdown = '# Title\n\n- First item\n- Second item';

    const normalized = await ingestPastedText(markdown);
    const joined = normalized.segments.map((segment) => segment.text).join(' ');

    expect(joined).toContain('Title');
    expect(joined).toContain('First item');
    expect(joined).toContain('Second item');
    expect(joined).not.toContain('Heading level');
    expect(joined).not.toContain('Bullet:');
    expect(joined).not.toContain('Numbered item');
  });

  it('falls back to plain text normalization for non-markdown paste', async () => {
    const normalized = await ingestPastedText('Just a plain paragraph of text.');

    expect(normalized.segments).toHaveLength(1);
    expect(normalized.segments[0]?.kind).toBe('text');
  });
});
