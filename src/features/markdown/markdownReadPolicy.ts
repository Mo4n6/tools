export type ListPrefixStyle = 'bullet' | 'numbered item' | 'none';

export interface MarkdownReadPolicy {
  includeCodeBlocks: boolean;
  announceHeadings: boolean;
  listPrefixStyle: ListPrefixStyle;
}

export const defaultMarkdownReadPolicy: MarkdownReadPolicy = {
  includeCodeBlocks: false,
  announceHeadings: true,
  listPrefixStyle: 'bullet',
};
