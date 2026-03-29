import { DEFAULT_KOKORO_MODEL } from '../modelArtifacts';
import { perfTelemetry } from '../perfTelemetry';
import { TTSProvider, TTSSegment, TTSSynthesisOptions, TTSSynthesisResult, TTSVoice } from '../types';

export type KokoroDevice = 'wasm' | 'webgpu';
export type KokoroDType = 'fp32' | 'fp16' | 'q8' | 'q4';

export interface KokoroProviderOptions {
  modelRepo?: string;
  dtype?: KokoroDType;
  device?: KokoroDevice;
}

type KokoroModule = {
  KokoroTTS: {
    from_pretrained: (
      modelId: string,
      options: { dtype?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'; device?: KokoroDevice | 'cpu' | null }
    ) => Promise<KokoroRuntimeEngine>;
  };
};

type KokoroRuntimeEngine = {
  voices?: Record<string, { name: string; language?: string }>;
  generate: (
    text: string,
    options: {
      voice?: string;
      speed?: number;
    }
  ) => Promise<{ toWav: () => Blob } | Blob | ArrayBuffer | Uint8Array>;
};

type KokoroEngine = {
  listVoices: () => Promise<Array<{ id: string; name: string; language?: string }>>;
  synthesize: (text: string, options: { voice?: string; speed?: number }) => Promise<Blob | ArrayBuffer | Uint8Array>;
};

const KOKORO_MODULE_ID = 'kokoro-js';

const importKokoroModule = async (): Promise<KokoroModule> => {
  const module = await import(/* @vite-ignore */ KOKORO_MODULE_ID);
  return module as KokoroModule;
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

export const canImportKokoroModule = async (): Promise<boolean> => {
  try {
    await importKokoroModule();
    return true;
  } catch {
    return false;
  }
};

export class KokoroProvider implements TTSProvider {
  private readonly modelRepo: string;
  private readonly dtype: KokoroDType;
  private readonly device: KokoroDevice;
  private enginePromise?: Promise<KokoroEngine>;

  constructor(options: KokoroProviderOptions = {}) {
    this.modelRepo = options.modelRepo ?? DEFAULT_KOKORO_MODEL;
    this.dtype = options.dtype ?? 'q8';
    this.device = options.device ?? 'wasm';
    this.validateStartupOptions();
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
    const kokoroModule = await importKokoroModule();
    const runtimeEngine = await kokoroModule.KokoroTTS.from_pretrained(this.modelRepo, {
      dtype: this.dtype,
      device: this.device,
    });
    const engine: KokoroEngine = {
      listVoices: async () =>
        Object.entries(runtimeEngine.voices ?? {}).map(([id, voice]) => ({
          id,
          name: voice.name ?? id,
          language: voice.language,
        })),
      synthesize: async (text, options) => {
        const audio = await runtimeEngine.generate(text, {
          voice: options.voice,
          speed: options.speed,
        });

        if (audio instanceof Blob || audio instanceof ArrayBuffer || audio instanceof Uint8Array) {
          return audio;
        }

        return audio.toWav();
      },
    };
    const durationMs = Math.round(perfTelemetry.now() - startedAt);
    const deviceMemoryGb = typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined;

    perfTelemetry.sink.log({
      type: 'tts.model_load',
      provider: 'kokoro',
      device: this.device,
      model: this.modelRepo,
      durationMs,
      peakMemoryMb: perfTelemetry.readPeakMemoryMb(),
      deviceMemoryGb,
    });

    return engine;
  }

  private validateStartupOptions(): void {
    if (!this.modelRepo.includes('/')) {
      throw new Error(
        'KOKORO_MODEL_ID_INVALID: modelRepo must include a "/" (for example "onnx-community/Kokoro-82M-ONNX").'
      );
    }
  }
}
