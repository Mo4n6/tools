import { DEFAULT_KOKORO_MODEL } from '../modelArtifacts';
import { perfTelemetry } from '../perfTelemetry';
import { KokoroDType, TTSProvider, TTSSegment, TTSSynthesisOptions, TTSSynthesisResult, TTSVoice } from '../types';

export type KokoroDevice = 'wasm' | 'webgpu';

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
  device?: string | null;
  backend?: string | null;
  config?: {
    device?: string | null;
    backend?: string | null;
  };
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

const MIN_REASONABLE_AUDIO_BYTES = 64;
const MIN_REASONABLE_AUDIO_SECONDS = 0.05;
const MIN_REASONABLE_RMS = 1e-4;
const KNOWN_PLAYABLE_BLOB_TYPES = new Set(['audio/wav', 'audio/wave', 'audio/x-wav']);
const NORMALIZED_PLAYABLE_BLOB_TYPE = 'audio/wav';

class TTSSynthFailureError extends Error {
  readonly code = 'tts.synth_failure' as const;

  constructor(reason: string) {
    super(`KOKORO_AUDIO_INVALID: ${reason}`);
    this.name = 'TTSSynthFailureError';
  }
}

const loadKokoroModule = async (): Promise<KokoroModule> => {
  const module = await import('kokoro-js');
  return module as KokoroModule;
};

let kokoroModulePromise: Promise<KokoroModule> | undefined;

const importKokoroModule = async (): Promise<KokoroModule> => {
  if (!kokoroModulePromise) {
    kokoroModulePromise = loadKokoroModule();
  }

  return kokoroModulePromise;
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

const normalizePlayableAudioBlob = (blob: Blob): Blob => {
  const normalizedType = blob.type.trim().toLowerCase();
  if (KNOWN_PLAYABLE_BLOB_TYPES.has(normalizedType)) {
    return normalizedType === NORMALIZED_PLAYABLE_BLOB_TYPE
      ? blob
      : new Blob([blob], { type: NORMALIZED_PLAYABLE_BLOB_TYPE });
  }

  if (normalizedType.length === 0 || normalizedType === 'application/octet-stream') {
    return new Blob([blob], { type: NORMALIZED_PLAYABLE_BLOB_TYPE });
  }

  return blob;
};

export const canImportKokoroModule = async (): Promise<boolean> => {
  try {
    await importKokoroModule();
    return true;
  } catch {
    kokoroModulePromise = undefined;
    return false;
  }
};

export class KokoroProvider implements TTSProvider {
  private readonly modelRepo: string;
  private readonly dtype: KokoroDType;
  private readonly device: KokoroDevice;
  private runtimeDevice?: KokoroDevice;
  private enginePromise?: Promise<KokoroEngine>;
  private wasmFallbackEnginePromise?: Promise<KokoroEngine>;

  constructor(options: KokoroProviderOptions = {}) {
    this.modelRepo = options.modelRepo ?? DEFAULT_KOKORO_MODEL;
    this.dtype = options.dtype ?? 'q8';
    this.device = options.device ?? 'wasm';
    this.validateStartupOptions();
  }

  async warmup(): Promise<void> {
    await this.getEngine();
  }

  getRuntimeDevice(): KokoroDevice {
    return this.runtimeDevice ?? this.device;
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
    try {
      return await this.synthesizeWithEngine(await this.getEngine(), segment, options);
    } catch (error) {
      if (!this.shouldDowngradeToWasm(error)) {
        throw error;
      }

      const reason = this.toDowngradeReason(error);
      perfTelemetry.sink.log({
        type: 'tts.runtime_downgrade',
        transition: 'webgpu->wasm',
        reason,
        segmentId: segment.id,
      });

      const wasmEngine = await this.getWasmFallbackEngine();
      return this.synthesizeWithEngine(wasmEngine, segment, options);
    }
  }

  async synthesizeWithRuntime(
    segment: TTSSegment,
    options: TTSSynthesisOptions = {},
    runtime: 'wasm' | 'webgpu'
  ): Promise<TTSSynthesisResult> {
    if (runtime === 'wasm') {
      const wasmEngine = await this.getWasmFallbackEngine();
      return this.synthesizeWithEngine(wasmEngine, segment, options);
    }

    return this.synthesizeWithEngine(await this.getEngine(), segment, options);
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
    this.runtimeDevice = this.resolveRuntimeDevice(runtimeEngine);
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
      device: this.runtimeDevice,
      model: this.modelRepo,
      durationMs,
      peakMemoryMb: perfTelemetry.readPeakMemoryMb(),
      deviceMemoryGb,
    });

    return engine;
  }

  private async synthesizeWithEngine(
    engine: KokoroEngine,
    segment: TTSSegment,
    options: TTSSynthesisOptions
  ): Promise<TTSSynthesisResult> {
    const output = await engine.synthesize(segment.text, {
      voice: options.voice,
      speed: options.rate,
    });

    const blob = normalizePlayableAudioBlob(toAudioBlob(output));
    await this.validateAudioBlob(blob);

    return {
      segmentId: segment.id,
      blob,
      url: URL.createObjectURL(blob),
    };
  }

  private shouldDowngradeToWasm(error: unknown): boolean {
    if (this.getRuntimeDevice() !== 'webgpu') {
      return false;
    }

    if (this.device !== 'webgpu') {
      return false;
    }

    if (!(error instanceof Error)) {
      return false;
    }

    return error.message.startsWith('KOKORO_AUDIO_INVALID:') || (error as { code?: string }).code === 'tts.synth_failure';
  }

  private toDowngradeReason(error: unknown): string {
    if (error instanceof Error && error.message.startsWith('KOKORO_AUDIO_INVALID:')) {
      return error.message.replace('KOKORO_AUDIO_INVALID:', '').trim();
    }

    return 'synthesis_validation_failed';
  }

  private getWasmFallbackEngine(): Promise<KokoroEngine> {
    if (!this.wasmFallbackEnginePromise) {
      this.wasmFallbackEnginePromise = this.loadKokoroEngineForDevice('wasm');
      this.runtimeDevice = 'wasm';
    }

    return this.wasmFallbackEnginePromise;
  }

  private async loadKokoroEngineForDevice(device: KokoroDevice): Promise<KokoroEngine> {
    const kokoroModule = await importKokoroModule();
    const runtimeEngine = await kokoroModule.KokoroTTS.from_pretrained(this.modelRepo, {
      dtype: this.dtype,
      device,
    });

    return {
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
  }

  private async validateAudioBlob(blob: Blob): Promise<void> {
    if (blob.size === 0) {
      throw new TTSSynthFailureError('empty_audio');
    }

    if (blob.size < MIN_REASONABLE_AUDIO_BYTES) {
      throw new TTSSynthFailureError(`suspicious_size_${blob.size}`);
    }

    if (!KNOWN_PLAYABLE_BLOB_TYPES.has(blob.type.trim().toLowerCase())) {
      throw new TTSSynthFailureError(`unsupported_mime_type_${blob.type || 'missing'}`);
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hasWavHeader = bytes.length >= 12
      && bytes[0] === 0x52
      && bytes[1] === 0x49
      && bytes[2] === 0x46
      && bytes[3] === 0x46
      && bytes[8] === 0x57
      && bytes[9] === 0x41
      && bytes[10] === 0x56
      && bytes[11] === 0x45;
    if (!hasWavHeader) {
      throw new TTSSynthFailureError('obvious_corruption_signal');
    }

    if (typeof AudioContext === 'undefined') {
      return;
    }

    try {
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(bytes.buffer.slice(0));
        if (!Number.isFinite(decoded.duration) || decoded.duration < MIN_REASONABLE_AUDIO_SECONDS) {
          throw new TTSSynthFailureError('suspicious_duration');
        }

        let sampleCount = 0;
        let energy = 0;
        for (let channelIndex = 0; channelIndex < decoded.numberOfChannels; channelIndex += 1) {
          const channelData = decoded.getChannelData(channelIndex);
          sampleCount += channelData.length;
          for (let sampleIndex = 0; sampleIndex < channelData.length; sampleIndex += 1) {
            const sample = channelData[sampleIndex] ?? 0;
            energy += sample * sample;
          }
        }

        if (sampleCount === 0) {
          throw new TTSSynthFailureError('empty_decoded_audio');
        }

        const rms = Math.sqrt(energy / sampleCount);
        if (this.getRuntimeDevice() === 'webgpu' && (!Number.isFinite(rms) || rms < MIN_REASONABLE_RMS)) {
          throw new TTSSynthFailureError('near_silent_audio');
        }
      } finally {
        await context.close();
      }
    } catch (error) {
      if (error instanceof TTSSynthFailureError) {
        throw error;
      }
      throw new TTSSynthFailureError('decode_error');
    }
  }

  private validateStartupOptions(): void {
    if (!this.modelRepo.includes('/')) {
      throw new Error(
        'KOKORO_MODEL_ID_INVALID: modelRepo must include a "/" (for example "onnx-community/Kokoro-82M-ONNX").'
      );
    }
  }

  private resolveRuntimeDevice(runtimeEngine: KokoroRuntimeEngine): KokoroDevice {
    const candidateDevice = runtimeEngine.device ?? runtimeEngine.backend ?? runtimeEngine.config?.device ?? runtimeEngine.config?.backend;
    if (candidateDevice === 'webgpu' || candidateDevice === 'wasm') {
      return candidateDevice;
    }

    return this.device;
  }
}
