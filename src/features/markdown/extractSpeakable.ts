import { remark } from 'remark';
import remarkParse from 'remark-parse';

import { NormalizedDocument, SpeakableSegment } from '../../domain/segments';
import { createSegment, normalizeWhitespace, withSegments } from '../../domain/normalize/shared';
import { defaultMarkdownReadPolicy, MarkdownReadPolicy } from './markdownReadPolicy';

interface MdNode {
  type: string;
  value?: string;
  depth?: number;
  lang?: string;
  ordered?: boolean;
  children?: MdNode[];
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
}

interface WalkContext {
  listContext?: {
    ordered: boolean;
    index: number;
  };
}

function nodeText(node: MdNode): string {
  if (typeof node.value === 'string') {
    return normalizeWhitespace(node.value);
  }

  return normalizeWhitespace((node.children ?? []).map(nodeText).join(' '));
}

function applyListPrefix(text: string, policy: MarkdownReadPolicy, listContext?: WalkContext['listContext']): string {
  if (!listContext || policy.listPrefixStyle === 'none') {
    return text;
  }

  if (listContext.ordered || policy.listPrefixStyle === 'numbered item') {
    return `Numbered item ${listContext.index}: ${text}`;
  }

  return `Bullet: ${text}`;
}

export function extractSpeakable(raw: string, policy: MarkdownReadPolicy = defaultMarkdownReadPolicy): NormalizedDocument {
  const tree = remark().use(remarkParse).parse(raw) as MdNode;
  const segments: Array<SpeakableSegment | null> = [];
  let position = 0;

  const walk = (node: MdNode, context: WalkContext = {}): void => {
    const sourceOffset = {
      start: node.position?.start?.offset ?? 0,
      end: node.position?.end?.offset ?? node.position?.start?.offset ?? 0,
    };

    switch (node.type) {
      case 'heading': {
        const text = nodeText(node);
        const headingText = policy.announceHeadings ? `Heading level ${node.depth ?? 1}: ${text}` : text;

        segments.push(
          createSegment({
            kind: 'markdown',
            blockType: 'heading',
            text: headingText,
            position: position++,
            sourceOffset,
            meta: { depth: node.depth ?? 1 },
          }),
        );
        return;
      }
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
      case 'listItem': {
        const listText = applyListPrefix(nodeText(node), policy, context.listContext);

        segments.push(
          createSegment({
            kind: 'markdown',
            blockType: 'list_item',
            text: listText,
            position: position++,
            sourceOffset,
            meta: { isListItemBoundary: true },
          }),
        );

        for (const child of node.children ?? []) {
          if (child.type === 'list') {
            walk(child, context);
          }
        }
        return;
      }
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
        if (policy.includeCodeBlocks) {
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
        }
        return;
      case 'list': {
        let index = 1;

        for (const child of node.children ?? []) {
          walk(child, {
            ...context,
            listContext: {
              ordered: Boolean(node.ordered),
              index: index++,
            },
          });
        }
        return;
      }
      default:
        break;
    }

    for (const child of node.children ?? []) {
      walk(child, context);
    }
  };

  walk(tree);

  return withSegments(segments);
}
