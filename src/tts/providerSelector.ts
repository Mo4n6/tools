import { DEFAULT_KOKORO_MODEL } from './modelArtifacts';
import { classifyTTSFailure, TTSFallbackError } from './errors';
import { perfTelemetry } from './perfTelemetry';
import { KokoroDevice, KokoroProvider, KokoroProviderOptions } from './providers/kokoroProvider';
import { WebSpeechProvider } from './providers/webSpeechProvider';
import { TTSProvider } from './types';

const DEFAULT_MEMORY_GB_THRESHOLD = 4;

const getDeviceMemoryGb = (): number | undefined => {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
};

const hasEnoughMemory = (minimumGb: number): boolean => {
  const memory = getDeviceMemoryGb();
  if (typeof memory !== 'number') {
    return true;
  }

  return memory >= minimumGb;
};

const getWebGpuSupport = async (): Promise<{ hasNavigatorGpu: boolean; adapterAvailable: boolean }> => {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return { hasNavigatorGpu: false, adapterAvailable: false };
  }

  const gpuNavigator = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
  const adapter = await gpuNavigator.gpu?.requestAdapter();
  return { hasNavigatorGpu: true, adapterAvailable: Boolean(adapter) };
};

export interface TTSProviderSelectorOptions {
  preferredDevice?: KokoroDevice;
  kokoro?: KokoroProviderOptions;
  minimumMemoryGb?: number;
}

export interface TTSProviderSelection {
  provider: TTSProvider;
  fallbackToWebSpeech: boolean;
  fallbackReason?: string;
  fallbackError?: TTSFallbackError;
}

const logFallbackRecordForDev = (fallbackError: TTSFallbackError): void => {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info(`[TTS_FALLBACK][${fallbackError.code}] ${fallbackError.message}`);
};

export const selectTTSProvider = async (
  options: TTSProviderSelectorOptions = {}
): Promise<TTSProviderSelection> => {
  const minimumMemoryGb = options.minimumMemoryGb ?? DEFAULT_MEMORY_GB_THRESHOLD;
  const requestedDevice = options.preferredDevice ?? options.kokoro?.device ?? 'wasm';
  const availableMemoryGb = getDeviceMemoryGb();
  const memorySufficient = hasEnoughMemory(minimumMemoryGb);
  const webGpuSupport = requestedDevice === 'webgpu'
    ? await getWebGpuSupport()
    : { hasNavigatorGpu: true, adapterAvailable: true };

  const shouldUseKokoro = memorySufficient && (requestedDevice === 'wasm' || webGpuSupport.adapterAvailable);

  if (shouldUseKokoro) {
    const kokoroProvider = new KokoroProvider({
      model: options.kokoro?.model ?? DEFAULT_KOKORO_MODEL,
      device: requestedDevice,
    });

    try {
      await kokoroProvider.warmup();
      return { provider: kokoroProvider, fallbackToWebSpeech: false };
    } catch (error) {
      const fallbackError = classifyTTSFailure(error, {
        error,
        minimumMemoryGb,
        availableMemoryGb,
        requestedDevice,
        hasNavigatorGpu: webGpuSupport.hasNavigatorGpu,
        webgpuAdapterAvailable: webGpuSupport.adapterAvailable,
      });

      perfTelemetry.sink.log({
        type: 'tts.degraded_mode',
        from: 'kokoro',
        to: 'web-speech',
        providerFrom: 'kokoro',
        providerTo: 'web-speech',
        fallbackCode: fallbackError.code,
        fallbackMessage: fallbackError.message,
        fallbackError,
      });
      logFallbackRecordForDev(fallbackError);
      return {
        provider: new WebSpeechProvider(),
        fallbackToWebSpeech: true,
        fallbackReason: fallbackError.message,
        fallbackError,
      };
    }
  }

  const fallbackError = classifyTTSFailure(undefined, {
    minimumMemoryGb,
    availableMemoryGb,
    requestedDevice,
    hasNavigatorGpu: webGpuSupport.hasNavigatorGpu,
    webgpuAdapterAvailable: webGpuSupport.adapterAvailable,
    error: memorySufficient
      ? 'WebGPU adapter unavailable for requested device.'
      : `Insufficient device memory for Kokoro. Required ${minimumMemoryGb}GB.`,
  });

  perfTelemetry.sink.log({
    type: 'tts.degraded_mode',
    from: 'kokoro',
    to: 'web-speech',
    providerFrom: 'kokoro',
    providerTo: 'web-speech',
    fallbackCode: fallbackError.code,
    fallbackMessage: fallbackError.message,
    fallbackError,
  });
  logFallbackRecordForDev(fallbackError);

  return {
    provider: new WebSpeechProvider(),
    fallbackToWebSpeech: true,
    fallbackReason: fallbackError.message,
    fallbackError,
  };
};
