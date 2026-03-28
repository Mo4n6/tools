export type InputKind = 'text' | 'markdown' | 'url_article';

export type SegmentBlockType = 'heading' | 'paragraph' | 'list_item' | 'blockquote' | 'code';

export interface SourceOffset {
  start: number;
  end: number;
}

export interface SpeakableSegment {
  id: string;
  kind: InputKind;
  text: string;
  blockType: SegmentBlockType;
  sourceOffset?: SourceOffset;
  meta?: Record<string, unknown>;
}

export interface NormalizedDocument {
  title?: string;
  language?: string;
  segments: SpeakableSegment[];
}
