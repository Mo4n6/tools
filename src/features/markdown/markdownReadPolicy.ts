export type ListPrefixStyle = 'bullet' | 'numbered item' | 'none';

export interface MarkdownReadPolicy {
  includeCodeBlocks: boolean;
  announceHeadings: boolean;
  listPrefixStyle: ListPrefixStyle;
}

export const plainMarkdownReadPolicy: MarkdownReadPolicy = {
  includeCodeBlocks: false,
  announceHeadings: false,
  listPrefixStyle: 'none',
};

export const expressiveMarkdownReadPolicy: MarkdownReadPolicy = {
  includeCodeBlocks: false,
  announceHeadings: true,
  listPrefixStyle: 'bullet',
};

export const defaultMarkdownReadPolicy: MarkdownReadPolicy = plainMarkdownReadPolicy;
