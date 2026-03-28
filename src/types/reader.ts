export type SegmentType = 'paragraph' | 'heading' | 'list-item' | 'caption' | 'other';
export type SourceType = 'text' | 'file' | 'url';

export interface SegmentOffset {
  start: number;
  end: number;
}

export interface SegmentMetadata {
  language?: string;
  confidence?: number;
  tags?: string[];
  [key: string]: string | number | string[] | undefined;
}

export interface SpeakableSegment {
  id: string;
  text: string;
  type: SegmentType;
  sourceOffsets: SegmentOffset;
  metadata?: SegmentMetadata;
}

export interface DocumentSource {
  type: SourceType;
  value: string;
  name?: string;
}

export interface DocumentWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface DocumentModel {
  title: string;
  source: DocumentSource;
  segments: SpeakableSegment[];
  warnings: DocumentWarning[];
}

export type PlaybackQueueStatus = 'idle' | 'ready' | 'playing' | 'paused' | 'completed';
