import { DocumentModel, DocumentSource, SpeakableSegment } from '../../types/reader';
import { normalizeText } from './normalizeText';
import { parseMarkdownToDrafts } from './parseMarkdown';
import { buildSegments, SegmentDraft, splitIntoSentenceRanges } from './segmenter';

function titleFromSegments(segments: SpeakableSegment[]): string {
  return segments[0]?.text.slice(0, 72) || 'Untitled Source';
}

function inferFileIsMarkdown(fileName: string): boolean {
  return /\.mdown$|\.md$|\.markdown$/i.test(fileName);
}

function buildParagraphSentenceDrafts(text: string): SegmentDraft[] {
  const paragraphs = text.split(/\n{2,}/);
  const drafts: SegmentDraft[] = [];
  let paragraphCursor = 0;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) {
      paragraphCursor += paragraph.length + 2;
      return;
    }

    const paragraphStart = text.indexOf(trimmedParagraph, paragraphCursor);
    const sentenceRanges = splitIntoSentenceRanges(trimmedParagraph);

    sentenceRanges.forEach((sentence, sentenceIndex) => {
      drafts.push({
        text: sentence.text,
        type: paragraphIndex === 0 && sentenceIndex === 0 ? 'heading' : 'paragraph',
        start: paragraphStart + sentence.start,
        end: paragraphStart + sentence.end,
        metadata: {
          tags: ['plain-text', 'sentence'],
          paragraphIndex,
          sentenceIndex,
        },
      });
    });

    paragraphCursor = paragraphStart + trimmedParagraph.length;
  });

  return drafts;
}

function createModel(source: DocumentSource, drafts: SegmentDraft[], warningMessage?: string): DocumentModel {
  const segments = buildSegments(drafts);

  return {
    title: titleFromSegments(segments),
    source,
    segments,
    warnings: segments.length
      ? warningMessage
        ? [{ code: 'INGEST_WARNING', message: warningMessage, severity: 'warning' }]
        : []
      : [{ code: 'NO_SEGMENTS', message: 'No speakable text found.', severity: 'warning' }],
  };
}

export async function ingestText(rawText: string): Promise<DocumentModel> {
  const normalized = normalizeText(rawText);
  const drafts = buildParagraphSentenceDrafts(normalized.text);

  return createModel({ type: 'text', value: rawText }, drafts);
}

export async function ingestFile(file: File): Promise<DocumentModel> {
  const fileText = await file.text();
  const normalized = normalizeText(fileText);

  if (inferFileIsMarkdown(file.name)) {
    try {
      const markdownDrafts = await parseMarkdownToDrafts(normalized.text);
      return createModel({ type: 'file', value: fileText, name: file.name }, markdownDrafts);
    } catch {
      const fallbackDrafts = buildParagraphSentenceDrafts(normalized.text);
      return createModel(
        { type: 'file', value: fileText, name: file.name },
        fallbackDrafts,
        'Markdown parser unavailable. Falling back to plain text segmentation.',
      );
    }
  }

  const plainDrafts = buildParagraphSentenceDrafts(normalized.text);
  return createModel({ type: 'file', value: fileText, name: file.name }, plainDrafts);
}

export async function ingestUrl(url: string): Promise<DocumentModel> {
  const normalized = normalizeText(url);
  const drafts = buildParagraphSentenceDrafts(normalized.text);

  return createModel({ type: 'url', value: url }, drafts, 'URL ingestion currently parses provided URL text only.');
}
