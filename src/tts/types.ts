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
  synthesizeWithRuntime?(
    segment: TTSSegment,
    options: TTSSynthesisOptions | undefined,
    runtime: 'wasm' | 'webgpu'
  ): Promise<TTSSynthesisResult>;
  playNative?(segment: TTSSegment, options?: TTSSynthesisOptions): Promise<void>;
  warmup(): Promise<void>;
}

export type KokoroDType = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
export type RuntimeDType = KokoroDType | 'n/a';
