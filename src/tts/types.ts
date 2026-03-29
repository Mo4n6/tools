export interface TTSSegment {
  id: string;
  text: string;
}

export interface TTSVoice {
  id: string;
  name: string;
  language?: string;
  provider: string;
}

export interface TTSSynthesisOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  format?: string;
}

export interface TTSAudioSynthesisResult {
  segmentId: string;
  blob: Blob;
  url: string;
  mode?: 'audio-url';
}

export interface TTSNativeSpokenResult {
  segmentId: string;
  mode: 'native-spoken';
}

export type TTSSynthesisResult = TTSAudioSynthesisResult | TTSNativeSpokenResult;

export interface TTSProvider {
  listVoices(): Promise<TTSVoice[]>;
  synthesize(segment: TTSSegment, options?: TTSSynthesisOptions): Promise<TTSSynthesisResult>;
  playNative?(segment: TTSSegment, options?: TTSSynthesisOptions): Promise<void>;
  warmup(): Promise<void>;
}
