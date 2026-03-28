import { remark } from 'remark';
import remarkParse from 'remark-parse';

import { NormalizedDocument, SpeakableSegment } from '../segments';
import { createSegment, normalizeWhitespace, withSegments } from './shared';

interface MdNode {
  type: string;
  value?: string;
  depth?: number;
  lang?: string;
  children?: MdNode[];
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
}

function nodeText(node: MdNode): string {
  if (typeof node.value === 'string') {
    return normalizeWhitespace(node.value);
  }

  return normalizeWhitespace((node.children ?? []).map(nodeText).join(' '));
}

export function normalizeMarkdown(raw: string): NormalizedDocument {
  const tree = remark().use(remarkParse).parse(raw) as MdNode;
  const segments: Array<SpeakableSegment | null> = [];

  let position = 0;

  const walk = (node: MdNode): void => {
    const sourceOffset = {
      start: node.position?.start?.offset ?? 0,
      end: node.position?.end?.offset ?? node.position?.start?.offset ?? 0,
    };

    switch (node.type) {
      case 'heading':
        segments.push(
          createSegment({
            kind: 'markdown',
            blockType: 'heading',
            text: nodeText(node),
            position: position++,
            sourceOffset,
            meta: { depth: node.depth ?? 1 },
          }),
        );
        return;
      case 'paragraph':
        segments.push(
          createSegment({
            kind: 'markdown',
            blockType: 'paragraph',
            text: nodeText(node),
            position: position++,
            sourceOffset,
          }),
        );
        return;
      case 'listItem':
        segments.push(
          createSegment({
            kind: 'markdown',
            blockType: 'list_item',
            text: nodeText(node),
            position: position++,
            sourceOffset,
          }),
        );
        return;
      case 'blockquote':
        segments.push(
          createSegment({
            kind: 'markdown',
            blockType: 'blockquote',
            text: nodeText(node),
            position: position++,
            sourceOffset,
          }),
        );
        return;
      case 'code':
        segments.push(
          createSegment({
            kind: 'markdown',
            blockType: 'code',
            text: node.value ?? '',
            position: position++,
            sourceOffset,
            meta: { language: node.lang },
          }),
        );
        return;
      default:
        break;
    }

    for (const child of node.children ?? []) {
      walk(child);
    }
  };

  walk(tree);

  return withSegments(segments);
}
