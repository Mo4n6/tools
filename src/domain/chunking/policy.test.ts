import { describe, expect, it } from 'vitest';
import type { SpeakableSegment } from '../segments';
import { chunkSegmentsByPolicy } from './policy';

const segments: SpeakableSegment[] = [
  {
    id: 'seg-1',
    kind: 'text',
    blockType: 'paragraph',
    text: 'First sentence. Second sentence.',
  },
  {
    id: 'seg-2',
    kind: 'markdown',
    blockType: 'paragraph',
    text: 'Third sentence follows.',
  },
];

describe('chunkSegmentsByPolicy', () => {
  it('applies sentence-aware chunking consistently across segment kinds', () => {
    const chunks = chunkSegmentsByPolicy(segments, {
      maxCharsPerChunk: 28,
      maxTokensPerChunk: 10,
      prosodySpacing: '  ',
      markdownListItemSeparator: '. ',
    });

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatchObject({ text: 'First sentence.' });
    expect(chunks[1]).toMatchObject({ text: 'Second sentence.' });
    expect(chunks[2]).toMatchObject({ text: 'Third sentence follows.' });
  });

  it('honors token limits and keeps consistent prosody spacing between pieces', () => {
    const chunks = chunkSegmentsByPolicy(segments, {
      maxCharsPerChunk: 80,
      maxTokensPerChunk: 5,
      prosodySpacing: ' ... ',
      markdownListItemSeparator: '. ',
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.text).toBe('First sentence. ... Second sentence.');
    expect(chunks[1]?.text).toBe('Third sentence follows.');
  });

  it('inserts stronger separators between adjacent markdown list items', () => {
    const listSegments: SpeakableSegment[] = [
      { id: 'list-1', kind: 'markdown', blockType: 'list_item', text: 'buy milk' },
      { id: 'list-2', kind: 'markdown', blockType: 'list_item', text: 'wash car' },
    ];

    const chunks = chunkSegmentsByPolicy(listSegments, {
      maxCharsPerChunk: 80,
      maxTokensPerChunk: 20,
      prosodySpacing: ' ',
      markdownListItemSeparator: '. ',
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe('buy milk. wash car');
    expect(chunks[0]?.text).not.toBe('buy milk wash car');
  });

  it('keeps non-list paragraph spacing unchanged', () => {
    const paragraphSegments: SpeakableSegment[] = [
      { id: 'p-1', kind: 'markdown', blockType: 'paragraph', text: 'alpha beta' },
      { id: 'p-2', kind: 'markdown', blockType: 'paragraph', text: 'gamma delta' },
    ];

    const chunks = chunkSegmentsByPolicy(paragraphSegments, {
      maxCharsPerChunk: 80,
      maxTokensPerChunk: 20,
      prosodySpacing: ' ',
      markdownListItemSeparator: '. ',
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe('alpha beta gamma delta');
  });
});
