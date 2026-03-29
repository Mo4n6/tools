import { normalizeArticleReadable, normalizeMarkdown, normalizePlainText } from '../../domain/normalize';
import { NormalizedDocument } from '../../domain/segments';
import { sanitizeReadabilityHtml } from '../preview/sanitizeHtml';

const MARKDOWN_EXTENSION = /\.md(?:own|arkdown)?$/i;
const HTML_EXTENSION = /\.html?$/i;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000E-\u001F\u007F]/;

export type FileParseErrorCode = 'UNSUPPORTED_FILE_TYPE' | 'BINARY_FILE_CONTENT';

export interface FileParseErrorShape {
  code: FileParseErrorCode;
  message: string;
  fileName: string;
}

export class FileParseError extends Error {
  readonly code: FileParseErrorCode;
  readonly fileName: string;

  constructor({ code, message, fileName }: FileParseErrorShape) {
    super(message);
    this.name = 'FileParseError';
    this.code = code;
    this.fileName = fileName;
  }
}

function inferIsMarkdown(fileName: string): boolean {
  return MARKDOWN_EXTENSION.test(fileName);
}

function inferIsHtml(file: Pick<File, 'name' | 'type'>): boolean {
  return HTML_EXTENSION.test(file.name) || file.type === 'text/html';
}

function inferIsPlainTextLike(file: Blob): boolean {
  if (!file.type) {
    return true;
  }

  return file.type.startsWith('text/') || file.type === 'application/json' || file.type === 'application/xml';
}

function hasLikelyBinaryContent(rawText: string): boolean {
  return CONTROL_CHARACTERS.test(rawText);
}

function extractReadableTextFromHtml(rawHtml: string): { title?: string; textContent: string } {
  const parsed = new DOMParser().parseFromString(rawHtml, 'text/html');
  const title = parsed.title?.trim() || undefined;
  const textContent = parsed.body.textContent?.trim() ?? '';

  return { title, textContent };
}

export function sanitizeFilePreviewHtml(rawHtml: string): string {
  return sanitizeReadabilityHtml(rawHtml);
}

/**
 * Uses Blob.text() to parse uploaded files into normalized documents.
 */
export async function ingestFile(file: File): Promise<NormalizedDocument> {
  if (!inferIsPlainTextLike(file) && !inferIsMarkdown(file.name) && !inferIsHtml(file)) {
    throw new FileParseError({
      code: 'UNSUPPORTED_FILE_TYPE',
      message: `Unsupported file type: ${file.type || 'unknown'}`,
      fileName: file.name,
    });
  }

  const rawText = await file.text();

  if (!rawText.trim() || hasLikelyBinaryContent(rawText)) {
    throw new FileParseError({
      code: 'BINARY_FILE_CONTENT',
      message: 'Uploaded file appears to be binary or contains unsupported control characters.',
      fileName: file.name,
    });
  }

  if (inferIsHtml(file)) {
    const { title, textContent } = extractReadableTextFromHtml(rawText);
    return title ? normalizeArticleReadable({ title, textContent }) : normalizePlainText(textContent);
  }

  return inferIsMarkdown(file.name) ? normalizeMarkdown(rawText) : normalizePlainText(rawText);
}
