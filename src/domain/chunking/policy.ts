import type { SpeakableSegment } from '../segments';

export interface ChunkingPolicy {
  maxCharsPerChunk: number;
  maxTokensPerChunk: number;
  prosodySpacing: string;
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
};

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

export function chunkSegmentsByPolicy(
  segments: SpeakableSegment[],
  policy: ChunkingPolicy = defaultChunkingPolicy,
): ChunkedPlaybackSegment[] {
  const chunkedSegments: ChunkedPlaybackSegment[] = [];

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
      const spacer = currentText ? policy.prosodySpacing : '';
      const candidateText = `${currentText}${spacer}${piece}`;
      const exceedsChars = candidateText.length > policy.maxCharsPerChunk;
      const exceedsTokens = currentTokens + pieceTokens > policy.maxTokensPerChunk;

      if (currentText && (exceedsChars || exceedsTokens)) {
        flush();
      }

      currentText = currentText ? `${currentText}${policy.prosodySpacing}${piece}` : piece;
      currentTokens += pieceTokens;
      currentPieces.push({ segmentId: segment.id, text: piece });
    }
  }

  flush();

  return chunkedSegments;
}
