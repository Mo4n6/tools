import { extractSpeakable } from '../../features/markdown/extractSpeakable';
import { defaultMarkdownReadPolicy, MarkdownReadPolicy } from '../../features/markdown/markdownReadPolicy';
import { sanitizeMarkdownPreviewHtml } from '../../features/preview/sanitizeHtml.browser';
import { NormalizedDocument } from '../segments';

export function normalizeMarkdown(raw: string, policy: MarkdownReadPolicy = defaultMarkdownReadPolicy): NormalizedDocument {
  return extractSpeakable(raw, policy);
}

export function sanitizeMarkdownHtmlPreview(renderedHtml: string): string {
  return sanitizeMarkdownPreviewHtml(renderedHtml);
}
