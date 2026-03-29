import { DEFAULT_KOKORO_MODEL } from '../modelArtifacts';
import { perfTelemetry } from '../perfTelemetry';
import { TTSProvider, TTSSegment, TTSSynthesisOptions, TTSSynthesisResult, TTSVoice } from '../types';

export type KokoroDevice = 'wasm' | 'webgpu';

export interface KokoroProviderOptions {
  model?: string;
  device?: KokoroDevice;
}

type KokoroModule = {
  createKokoroTTS: (options: { model: string; device: KokoroDevice }) => Promise<KokoroEngine>;
};

type KokoroEngine = {
  listVoices: () => Promise<Array<{ id: string; name: string; language?: string }>>;
  synthesize: (
    text: string,
    options: {
      voice?: string;
      speed?: number;
      pitch?: number;
      format?: string;
    }
  ) => Promise<Blob | ArrayBuffer | Uint8Array>;
};

const toAudioBlob = (audio: Blob | ArrayBuffer | Uint8Array): Blob => {
  if (audio instanceof Blob) {
    return audio;
  }

  if (audio instanceof ArrayBuffer) {
    return new Blob([audio], { type: 'audio/wav' });
  }

  const bytes = new Uint8Array(audio.byteLength);
  bytes.set(audio);
  return new Blob([bytes], { type: 'audio/wav' });
};

export class KokoroProvider implements TTSProvider {
  private readonly model: string;
  private readonly device: KokoroDevice;
  private enginePromise?: Promise<KokoroEngine>;

  constructor(options: KokoroProviderOptions = {}) {
    this.model = options.model ?? DEFAULT_KOKORO_MODEL;
    this.device = options.device ?? 'wasm';
  }

  async warmup(): Promise<void> {
    await this.getEngine();
  }

  async listVoices(): Promise<TTSVoice[]> {
    const engine = await this.getEngine();
    const voices = await engine.listVoices();

    return voices.map((voice) => ({
      id: voice.id,
      name: voice.name,
      language: voice.language,
      provider: 'kokoro',
    }));
  }

  async synthesize(segment: TTSSegment, options: TTSSynthesisOptions = {}): Promise<TTSSynthesisResult> {
    const engine = await this.getEngine();

    const output = await engine.synthesize(segment.text, {
      voice: options.voice,
      speed: options.rate,
      pitch: options.pitch,
      format: options.format,
    });

    const blob = toAudioBlob(output);

    return {
      segmentId: segment.id,
      blob,
      url: URL.createObjectURL(blob),
    };
  }

  private getEngine(): Promise<KokoroEngine> {
    if (!this.enginePromise) {
      this.enginePromise = this.loadKokoroEngine();
    }

    return this.enginePromise;
  }

  private async loadKokoroEngine(): Promise<KokoroEngine> {
    const startedAt = perfTelemetry.now();
    const moduleId = 'kokoro-js';
    const module = await import(/* @vite-ignore */ moduleId) as KokoroModule;
    const engine = await module.createKokoroTTS({
      model: this.model,
      device: this.device,
    });
    const durationMs = Math.round(perfTelemetry.now() - startedAt);
    const deviceMemoryGb = typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined;

    perfTelemetry.sink.log({
      type: 'tts.model_load',
      provider: 'kokoro',
      device: this.device,
      model: this.model,
      durationMs,
      peakMemoryMb: perfTelemetry.readPeakMemoryMb(),
      deviceMemoryGb,
    });

    return engine;
  }
}
