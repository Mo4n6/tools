import { InputKind, NormalizedDocument, SegmentBlockType, SpeakableSegment } from '../segments';

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\t\f\v ]+/g, ' ').trim();
}

export function createSegmentId(text: string, position: number): string {
  return `seg_${fnv1a(`${position}:${text}`)}`;
}

export function createSegment(params: {
  kind: InputKind;
  blockType: SegmentBlockType;
  text: string;
  position: number;
  sourceOffset?: { start: number; end: number };
  meta?: Record<string, unknown>;
}): SpeakableSegment | null {
  const normalizedText = normalizeWhitespace(params.text);
  if (!normalizedText) {
    return null;
  }

  return {
    id: createSegmentId(normalizedText, params.position),
    kind: params.kind,
    text: normalizedText,
    blockType: params.blockType,
    sourceOffset: params.sourceOffset,
    meta: params.meta,
  };
}

export function withSegments(segments: Array<SpeakableSegment | null>, base: Omit<NormalizedDocument, 'segments'> = {}): NormalizedDocument {
  return {
    ...base,
    segments: segments.filter((segment): segment is SpeakableSegment => segment !== null),
  };
}
