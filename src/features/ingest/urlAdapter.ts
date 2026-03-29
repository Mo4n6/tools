import { normalizeArticleReadable } from '../../domain/normalize';
import { NormalizedDocument } from '../../domain/segments';
import { sanitizeReadabilityHtml } from '../preview/sanitizeHtml.browser';

interface ExtractResponse {
  article?: {
    title?: string;
    textContent?: string;
    content?: string;
  };
  title?: string;
  textContent?: string;
  content?: string;
}

export type UrlIngestErrorCode =
  | 'URL_INGEST_DISABLED'
  | 'URL_EXTRACT_UNAVAILABLE'
  | 'URL_EXTRACT_FAILED';

export class UrlIngestError extends Error {
  constructor(
    public readonly code: UrlIngestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UrlIngestError';
  }
}

function extractTextFromHtml(html: string): string {
  if (!html.trim()) {
    return '';
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent?.trim() ?? '';
}

function toReadablePayload(payload: ExtractResponse): { title?: string; textContent: string } {
  const articleText = payload.article?.textContent;
  const topLevelText = payload.textContent;

  const articleContent = sanitizeReadabilityHtml(payload.article?.content ?? '');
  const topLevelContent = sanitizeReadabilityHtml(payload.content ?? '');
  const articleTextFromHtml = extractTextFromHtml(articleContent);
  const topLevelTextFromHtml = extractTextFromHtml(topLevelContent);

  const textContent = articleText ?? topLevelText ?? articleTextFromHtml ?? topLevelTextFromHtml;

  return {
    title: payload.article?.title ?? payload.title,
    textContent,
  };
}

/**
 * Sends a URL to the backend extractor and normalizes the readability payload.
 */
export async function ingestUrl(url: string): Promise<NormalizedDocument> {
  if (import.meta.env.VITE_ENABLE_URL_INGEST === 'false') {
    throw new UrlIngestError(
      'URL_INGEST_DISABLED',
      'URL ingestion is disabled in this environment. Paste text or upload a file instead.',
    );
  }

  const extractApiBaseUrl = import.meta.env.VITE_EXTRACT_API_BASE_URL?.trim() || '/api/extract';

  let response: Response;
  try {
    response = await fetch(extractApiBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new UrlIngestError(
      'URL_EXTRACT_UNAVAILABLE',
      'URL extraction is currently unavailable. Please try again later or use paste/upload instead.',
    );
  }

  if (!response.ok) {
    if (response.status === 404 || response.status >= 500) {
      throw new UrlIngestError(
        'URL_EXTRACT_UNAVAILABLE',
        'URL extraction service is unavailable right now. Please try again later or use paste/upload instead.',
      );
    }

    throw new UrlIngestError(
      'URL_EXTRACT_FAILED',
      'We could not extract readable text from that URL. Verify the link and try another page.',
    );
  }

  const payload = (await response.json()) as ExtractResponse;
  return normalizeArticleReadable(toReadablePayload(payload));
}

export type IngestInputRequest =
  | { type: 'paste'; payload: string }
  | { type: 'file'; payload: File }
  | { type: 'url'; payload: string };

/**
 * Unified ingestion facade for paste, file, and URL inputs.
 */
export async function ingestInput({ type, payload }: IngestInputRequest): Promise<NormalizedDocument> {
  switch (type) {
    case 'paste':
      return (await import('./pasteAdapter')).ingestPastedText(payload);
    case 'file':
      return (await import('./fileAdapter')).ingestFile(payload);
    case 'url':
      return ingestUrl(payload);
    default: {
      const neverType: never = type;
      throw new Error(`Unknown ingest type: ${neverType}`);
    }
  }
}
