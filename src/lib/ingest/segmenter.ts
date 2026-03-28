import { SegmentMetadata, SegmentType, SpeakableSegment } from '../../types/reader';

export interface SegmentDraft {
  text: string;
  type: SegmentType;
  start: number;
  end: number;
  metadata?: SegmentMetadata;
}

export function splitIntoSentenceRanges(text: string): Array<{ start: number; end: number; text: string }> {
  const ranges: Array<{ start: number; end: number; text: string }> = [];
  const sentenceRegex = /[^.!?\n]+[.!?]*(?=\s|$)/g;
  let match: RegExpExecArray | null;

  while ((match = sentenceRegex.exec(text)) !== null) {
    const sentence = match[0].trim();
    if (!sentence) {
      continue;
    }

    const relativeStart = match.index + match[0].indexOf(sentence);
    const start = relativeStart;
    const end = start + sentence.length;

    ranges.push({ start, end, text: sentence });
  }

  if (ranges.length === 0 && text.trim()) {
    return [{ start: 0, end: text.trim().length, text: text.trim() }];
  }

  return ranges;
}

export function buildSegments(drafts: SegmentDraft[]): SpeakableSegment[] {
  return drafts.map((draft, index) => ({
    id: `${draft.type}-${String(index + 1).padStart(4, '0')}`,
    text: draft.text,
    type: draft.type,
    sourceOffsets: {
      start: draft.start,
      end: draft.end,
    },
    metadata: draft.metadata,
  }));
}
