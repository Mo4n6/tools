import type { SpeakableSegment } from '../segments';

export interface ChunkingPolicy {
  maxCharsPerChunk: number;
  maxTokensPerChunk: number;
  prosodySpacing: string;
  markdownListItemSeparator: string;
}

export interface ChunkPiece {
  segmentId: string;
  text: string;
}

export interface ChunkedPlaybackSegment {
  id: string;
  text: string;
  pieces: ChunkPiece[];
}

export const defaultChunkingPolicy: ChunkingPolicy = {
  maxCharsPerChunk: 900,
  maxTokensPerChunk: 160,
  prosodySpacing: ' ',
  markdownListItemSeparator: '. ',
};

function endsWithTerminalPunctuation(text: string): boolean {
  return /[.!?]["')\]]*$/.test(text.trim());
}

function isMarkdownListItem(segment?: SpeakableSegment): boolean {
  return segment?.kind === 'markdown' && segment.blockType === 'list_item';
}

export function getChunkPieceSeparator(
  previousSegment: SpeakableSegment | undefined,
  nextSegment: SpeakableSegment,
  policy: ChunkingPolicy,
): string {
  if (isMarkdownListItem(previousSegment) && isMarkdownListItem(nextSegment)) {
    return previousSegment && endsWithTerminalPunctuation(previousSegment.text) ? ' ' : policy.markdownListItemSeparator;
  }

  return policy.prosodySpacing;
}

const sentenceSplitPattern = /(?<=[.!?])\s+(?=[A-Z0-9"'])/g;

function splitIntoSentences(text: string): string[] {
  return text
    .split(sentenceSplitPattern)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function estimateTokens(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function splitOversizedSentence(sentence: string, policy: ChunkingPolicy): string[] {
  const words = sentence.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];

  let current = '';
  let currentTokens = 0;

  for (const word of words) {
    const spacer = current ? policy.prosodySpacing : '';
    const candidate = `${current}${spacer}${word}`;
    if (current && (candidate.length > policy.maxCharsPerChunk || currentTokens + 1 > policy.maxTokensPerChunk)) {
      chunks.push(current);
      current = word;
      currentTokens = 1;
    } else {
      current = candidate;
      currentTokens += 1;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function splitSegmentText(text: string, policy: ChunkingPolicy): string[] {
  const sentences = splitIntoSentences(text);
  const pieces: string[] = [];

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);
    if (sentence.length > policy.maxCharsPerChunk || sentenceTokens > policy.maxTokensPerChunk) {
      pieces.push(...splitOversizedSentence(sentence, policy));
    } else {
      pieces.push(sentence);
    }
  }

  if (!pieces.length) {
    const trimmed = text.trim();
    return trimmed ? [trimmed] : [];
  }

  return pieces;
}

function chunkByWordBoundaries(text: string, maxChars: number, maxTokens: number, spacing: string): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }

  const result: string[] = [];
  let current = '';
  let currentTokens = 0;

  for (const word of words) {
    const spacer = current ? spacing : '';
    const candidate = `${current}${spacer}${word}`;
    if (current && (candidate.length > maxChars || currentTokens + 1 > maxTokens)) {
      result.push(current);
      current = word;
      currentTokens = 1;
      continue;
    }

    current = candidate;
    currentTokens += 1;
  }

  if (current) {
    result.push(current);
  }

  return result;
}

export function splitTextForSynthesisRetry(
  text: string,
  policy: ChunkingPolicy = defaultChunkingPolicy,
): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const sentences = splitIntoSentences(normalized);
  if (sentences.length >= 2) {
    const midpoint = Math.ceil(sentences.length / 2);
    const halves = [
      sentences.slice(0, midpoint).join(policy.prosodySpacing).trim(),
      sentences.slice(midpoint).join(policy.prosodySpacing).trim(),
    ].filter(Boolean);

    return halves.flatMap((part) => splitSegmentText(part, policy));
  }

  return chunkByWordBoundaries(
    normalized,
    Math.max(1, Math.floor(policy.maxCharsPerChunk / 2)),
    Math.max(1, Math.floor(policy.maxTokensPerChunk / 2)),
    policy.prosodySpacing,
  );
}

export function chunkSegmentsByPolicy(
  segments: SpeakableSegment[],
  policy: ChunkingPolicy = defaultChunkingPolicy,
): ChunkedPlaybackSegment[] {
  const chunkedSegments: ChunkedPlaybackSegment[] = [];
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));

  let currentText = '';
  let currentTokens = 0;
  let currentPieces: ChunkPiece[] = [];

  const flush = (): void => {
    if (!currentText.trim()) {
      return;
    }

    chunkedSegments.push({
      id: `chunk_${chunkedSegments.length}`,
      text: currentText.trim(),
      pieces: [...currentPieces],
    });

    currentText = '';
    currentTokens = 0;
    currentPieces = [];
  };

  for (const segment of segments) {
    const pieces = splitSegmentText(segment.text, policy);

    for (const piece of pieces) {
      const pieceTokens = estimateTokens(piece);
      const previousPiece = currentPieces[currentPieces.length - 1];
      const previousSegment = previousPiece ? segmentById.get(previousPiece.segmentId) : undefined;
      const spacer = currentText ? getChunkPieceSeparator(previousSegment, segment, policy) : '';
      const candidateText = `${currentText}${spacer}${piece}`;
      const exceedsChars = candidateText.length > policy.maxCharsPerChunk;
      const exceedsTokens = currentTokens + pieceTokens > policy.maxTokensPerChunk;

      if (currentText && (exceedsChars || exceedsTokens)) {
        flush();
      }

      currentText = currentText ? `${currentText}${spacer}${piece}` : piece;
      currentTokens += pieceTokens;
      currentPieces.push({ segmentId: segment.id, text: piece });
    }
  }

  flush();

  return chunkedSegments;
}
