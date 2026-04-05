import { describe, expect, it } from 'vitest';

import { extractSpeakable } from './extractSpeakable';

describe('extractSpeakable', () => {
  it('marks markdown list items with list-boundary metadata', () => {
    const doc = extractSpeakable('- first item\n- second item');

    expect(doc.segments).toHaveLength(2);
    expect(doc.segments[0]).toMatchObject({
      blockType: 'list_item',
      text: 'first item',
      meta: { isListItemBoundary: true },
    });
    expect(doc.segments[1]).toMatchObject({
      blockType: 'list_item',
      text: 'second item',
      meta: { isListItemBoundary: true },
    });
  });
});
