import { NormalizedDocument } from '../segments';
import { createSegment, withSegments } from './shared';

interface ReadableArticle {
  title?: string;
  textContent: string;
}

export function normalizeArticleReadable(article: ReadableArticle): NormalizedDocument {
  const paragraphs = article.textContent
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\n+/g, ' ').trim())
    .filter(Boolean);

  return withSegments(
    paragraphs.map((paragraph, index) =>
      createSegment({
        kind: 'url_article',
        blockType: 'paragraph',
        text: paragraph,
        position: index,
      }),
    ),
    { title: article.title },
  );
}
