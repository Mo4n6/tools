import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PreviewPanel } from './PreviewPanel';
import type { SpeakableSegment } from '../../domain/segments';

const segments: SpeakableSegment[] = [
  {
    id: 'seg-1',
    kind: 'markdown',
    text: 'Main Title',
    blockType: 'heading',
    sourceOffset: { start: 0, end: 10 },
  },
  {
    id: 'seg-2',
    kind: 'markdown',
    text: 'List item text',
    blockType: 'list_item',
    sourceOffset: { start: 11, end: 26 },
  },
];

describe('PreviewPanel', () => {
  it('hides block labels and source offsets in continuous mode', () => {
    const html = renderToStaticMarkup(
      <PreviewPanel segments={segments} currentSegmentIndex={0} isContinuousMode />,
    );

    expect(html).toContain('preview-continuous-flow');
    expect(html).toContain('Main Title');
    expect(html).not.toContain('heading');
    expect(html).not.toContain('list_item');
    expect(html).not.toContain('0-10');
    expect(html).not.toContain('11-26');
  });

  it('renders segmented metadata cards outside continuous mode', () => {
    const html = renderToStaticMarkup(
      <PreviewPanel segments={segments} currentSegmentIndex={0} isContinuousMode={false} />,
    );

    expect(html).toContain('preview-segmented-cards');
    expect(html).toContain('heading');
    expect(html).toContain('list_item');
    expect(html).toContain('0-10');
    expect(html).toContain('11-26');
  });
});
