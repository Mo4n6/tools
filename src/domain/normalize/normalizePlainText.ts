import { NormalizedDocument } from '../segments';
import { createSegment, withSegments } from './shared';

export function normalizePlainText(raw: string): NormalizedDocument {
  const unified = raw.replace(/\r\n?/g, '\n');
  const paragraphs = unified
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\n+/g, ' ').trim())
    .filter(Boolean);

  return withSegments(
    paragraphs.map((paragraph, index) =>
      createSegment({
        kind: 'text',
        blockType: 'paragraph',
        text: paragraph,
        position: index,
      }),
    ),
  );
}
