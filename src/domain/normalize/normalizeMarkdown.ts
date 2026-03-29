import { extractSpeakable } from '../../features/markdown/extractSpeakable';
import { defaultMarkdownReadPolicy, MarkdownReadPolicy } from '../../features/markdown/markdownReadPolicy';
import { NormalizedDocument } from '../segments';

export function normalizeMarkdown(raw: string, policy: MarkdownReadPolicy = defaultMarkdownReadPolicy): NormalizedDocument {
  return extractSpeakable(raw, policy);
}
