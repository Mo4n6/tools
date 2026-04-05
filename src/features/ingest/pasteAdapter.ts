import { normalizeMarkdown, normalizePlainText } from '../../domain/normalize';
import { NormalizedDocument } from '../../domain/segments';

const MARKDOWN_HEADING_PATTERN = /^\s{0,3}#{1,6}\s+/m;
const MARKDOWN_LIST_PATTERN = /^\s{0,3}(?:[-*+]\s+|\d+\.\s+)/m;
const MARKDOWN_CODE_FENCE_PATTERN = /```/;

function inferIsMarkdown(textareaValue: string): boolean {
  return MARKDOWN_HEADING_PATTERN.test(textareaValue)
    || MARKDOWN_LIST_PATTERN.test(textareaValue)
    || MARKDOWN_CODE_FENCE_PATTERN.test(textareaValue);
}

/**
 * Converts textarea content into a speakable normalized document.
 */
export function ingestPastedText(textareaValue: string): Promise<NormalizedDocument> {
  return Promise.resolve(inferIsMarkdown(textareaValue)
    ? normalizeMarkdown(textareaValue)
    : normalizePlainText(textareaValue));
}
