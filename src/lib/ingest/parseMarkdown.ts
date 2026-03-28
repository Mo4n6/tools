import { SegmentDraft } from './segmenter';

interface MdNode {
  type: string;
  value?: string;
  depth?: number;
  children?: MdNode[];
  ordered?: boolean;
  lang?: string;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
}

const REMARK_MODULE = 'remark';
const REMARK_PARSE_MODULE = 'remark-parse';

function nodeText(node: MdNode): string {
  if (typeof node.value === 'string') {
    return node.value;
  }

  return (node.children ?? []).map(nodeText).join(' ').replace(/\s+/g, ' ').trim();
}

function pushIfPresent(drafts: SegmentDraft[], text: string, type: SegmentDraft['type'], node: MdNode, metadata?: SegmentDraft['metadata']) {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  if (!normalizedText) {
    return;
  }

  drafts.push({
    text: normalizedText,
    type,
    start: node.position?.start?.offset ?? 0,
    end: node.position?.end?.offset ?? (node.position?.start?.offset ?? 0) + normalizedText.length,
    metadata,
  });
}

function walkMarkdown(node: MdNode, drafts: SegmentDraft[]) {
  switch (node.type) {
    case 'heading':
      pushIfPresent(drafts, nodeText(node), 'heading', node, {
        tags: ['markdown', `h${node.depth ?? 1}`],
      });
      return;
    case 'paragraph':
      pushIfPresent(drafts, nodeText(node), 'paragraph', node, {
        tags: ['markdown'],
      });
      return;
    case 'listItem':
      pushIfPresent(drafts, nodeText(node), 'list-item', node, {
        tags: ['markdown', 'list-item'],
      });
      return;
    case 'blockquote':
      pushIfPresent(drafts, nodeText(node), 'paragraph', node, {
        tags: ['markdown', 'blockquote'],
      });
      break;
    case 'code':
      pushIfPresent(drafts, node.value ?? '', 'other', node, {
        tags: ['markdown', 'code-block'],
        language: node.lang,
      });
      return;
    default:
      break;
  }

  for (const child of node.children ?? []) {
    walkMarkdown(child, drafts);
  }
}

export async function parseMarkdownToDrafts(markdown: string): Promise<SegmentDraft[]> {
  const remarkModuleName = REMARK_MODULE;
  const parseModuleName = REMARK_PARSE_MODULE;

  const [{ remark }, remarkParseModule] = await Promise.all([
    import(remarkModuleName) as Promise<{ remark: () => { use: (plugin: unknown) => unknown; parse: (input: string) => MdNode } }>,
    import(parseModuleName) as Promise<{ default: unknown }>,
  ]);

  const parser = remark() as { use: (plugin: unknown) => { parse: (input: string) => MdNode } };
  const tree = parser.use(remarkParseModule.default).parse(markdown) as MdNode;
  const drafts: SegmentDraft[] = [];

  walkMarkdown(tree, drafts);

  return drafts;
}
