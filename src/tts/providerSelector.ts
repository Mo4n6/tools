import { DEFAULT_KOKORO_MODEL } from './modelArtifacts';
import { classifyTTSFailure, TTSFallbackError } from './errors';
import { perfTelemetry } from './perfTelemetry';
import { canImportKokoroModule, KokoroDevice, KokoroProvider, KokoroProviderOptions } from './providers/kokoroProvider';
import { WebSpeechProvider } from './providers/webSpeechProvider';
import type { KokoroDType, RuntimeDType, TTSAudioSynthesisResult, TTSSynthesisResult, TTSProvider } from './types';

const DEFAULT_MEMORY_GB_THRESHOLD = 4;
const WEBGPU_UNSTABLE_PROFILES_STORAGE_KEY = 'reader-tts-webgpu-unstable-profiles-v1';
const isPagesStyleBase = (): boolean => import.meta.env.BASE_URL !== '/';
const isAudioUrlResult = (result: TTSSynthesisResult): result is TTSAudioSynthesisResult => 'url' in result;

const getGpuFingerprintFragment = (): string => {
  if (typeof document === 'undefined') {
    return 'unknown-gpu';
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
  if (!context) {
    return 'unknown-gpu';
  }

  const webGlContext = context as WebGLRenderingContext;
  const debugExtension = webGlContext.getExtension('WEBGL_debug_renderer_info');
  if (!debugExtension) {
    return 'unknown-gpu';
  }

  const renderer = webGlContext.getParameter(debugExtension.UNMASKED_RENDERER_WEBGL);
  return typeof renderer === 'string' && renderer.trim().length > 0 ? renderer : 'unknown-gpu';
};

const getBrowserGpuProfileKey = (): string => {
  if (typeof navigator === 'undefined') {
    return 'unknown-browser::unknown-gpu';
  }

  return `${navigator.userAgent}::${getGpuFingerprintFragment()}`;
};

const loadUnstableWebGpuProfiles = (): Record<string, { markedAt: string; reason: string }> => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(WEBGPU_UNSTABLE_PROFILES_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, { markedAt?: string; reason?: string }>;
    return Object.entries(parsed).reduce<Record<string, { markedAt: string; reason: string }>>((acc, [key, value]) => {
      if (typeof value?.markedAt === 'string' && typeof value?.reason === 'string') {
        acc[key] = {
          markedAt: value.markedAt,
          reason: value.reason,
        };
      }

      return acc;
    }, {});
  } catch {
    return {};
  }
};

const isWebGpuMarkedUnstableForCurrentProfile = (): boolean => {
  const profileKey = getBrowserGpuProfileKey();
  return Boolean(loadUnstableWebGpuProfiles()[profileKey]);
};

const markWebGpuUnstableForCurrentProfile = (reason: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const profileKey = getBrowserGpuProfileKey();
  const profiles = loadUnstableWebGpuProfiles();
  profiles[profileKey] = {
    markedAt: new Date().toISOString(),
    reason,
  };
  window.localStorage.setItem(WEBGPU_UNSTABLE_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
};

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
  skipKokoroInit?: boolean;
  skipKokoroInitReason?: string;
  allowWebGpuIfUnstable?: boolean;
}

export interface TTSProviderSelection {
  provider: TTSProvider;
  providerType: 'kokoro' | 'web-speech';
  runtime: 'webgpu' | 'wasm' | 'system';
  dtype: RuntimeDType;
  fallbackToWebSpeech: boolean;
  fallbackIntentional?: boolean;
  fallbackReason?: string;
  fallbackError?: TTSFallbackError;
}

const resolveKokoroDtype = (
  device: KokoroDevice,
  configuredDtype?: KokoroProviderOptions['dtype']
): KokoroDType => {
  if (configuredDtype) {
    return configuredDtype;
  }

  if (device === 'webgpu') {
    return 'fp16';
  }

  return 'q8';
};

const logFallbackRecordForDev = (fallbackError: TTSFallbackError): void => {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info(`[TTS_FALLBACK][${fallbackError.code}] ${fallbackError.message}`);
};

const KOKORO_QUALITY_CHECK_SENTENCE = 'This is a Kokoro test in English.';
const WEBGPU_QUALITY_CHECK_WARNING = 'WebGPU output quality check failed; switched to WASM.';
const createWebSpeechSelection = (
  partial: Omit<TTSProviderSelection, 'provider' | 'providerType' | 'runtime' | 'dtype'>
): TTSProviderSelection => ({
  provider: new WebSpeechProvider(),
  providerType: 'web-speech',
  runtime: 'system',
  dtype: 'n/a',
  ...partial,
});

export const selectTTSProvider = async (
  options: TTSProviderSelectorOptions = {}
): Promise<TTSProviderSelection> => {
  if (options.skipKokoroInit) {
    const reason = options.skipKokoroInitReason ?? 'Kokoro initialization intentionally skipped.';
    const fallbackError: TTSFallbackError = {
      code: 'KOKORO_INIT_SKIPPED',
      message: reason,
      hints: ['Enable Kokoro initialization to attempt neural TTS before fallback.'],
    };

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

    return createWebSpeechSelection({
      fallbackToWebSpeech: true,
      fallbackIntentional: true,
      fallbackReason: reason,
      fallbackError,
    });
  }

  const minimumMemoryGb = options.minimumMemoryGb ?? DEFAULT_MEMORY_GB_THRESHOLD;
  const webGpuSupport = await getWebGpuSupport();
  const hasKnownUnstableWebGpuRuntime = isWebGpuMarkedUnstableForCurrentProfile();
  const shouldAvoidWebGpuForProfile = hasKnownUnstableWebGpuRuntime && !options.allowWebGpuIfUnstable;
  const requestedDevice =
    options.preferredDevice
    ?? options.kokoro?.device
    ?? (webGpuSupport.adapterAvailable && !shouldAvoidWebGpuForProfile ? 'webgpu' : 'wasm');
  const availableMemoryGb = getDeviceMemoryGb();
  const memorySufficient = hasEnoughMemory(minimumMemoryGb);

  const shouldUseKokoro = memorySufficient && (requestedDevice === 'wasm' || webGpuSupport.adapterAvailable);

  if (shouldUseKokoro) {
    if (isPagesStyleBase()) {
      const kokoroImportable = await canImportKokoroModule();
      if (!kokoroImportable) {
        const fallbackError = classifyTTSFailure(
          new Error("Failed to resolve module specifier 'kokoro-js' in GitHub Pages mode."),
          {
            minimumMemoryGb,
            availableMemoryGb,
            requestedDevice,
            hasNavigatorGpu: webGpuSupport.hasNavigatorGpu,
            webgpuAdapterAvailable: webGpuSupport.adapterAvailable,
          },
        );

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

        return createWebSpeechSelection({
          fallbackToWebSpeech: true,
          fallbackReason: fallbackError.message,
          fallbackError,
        });
      }
    }

    const selectedDtype = resolveKokoroDtype(requestedDevice, options.kokoro?.dtype);
    const kokoroProvider = new KokoroProvider({
      modelRepo: options.kokoro?.modelRepo ?? DEFAULT_KOKORO_MODEL,
      dtype: selectedDtype,
      device: requestedDevice,
    });

    try {
      await kokoroProvider.warmup();
      const runtimeAfterWarmup = kokoroProvider.getRuntimeDevice();

      if (runtimeAfterWarmup === 'webgpu') {
        let webGpuQualityCheckFailed = false;

        try {
          const qualityCheckResult = await kokoroProvider.synthesizeWithRuntime({
            id: 'kokoro-quality-check',
            text: KOKORO_QUALITY_CHECK_SENTENCE,
          }, {}, 'webgpu');

          if (!isAudioUrlResult(qualityCheckResult)) {
            throw new Error('Kokoro quality check returned a non-audio synthesis result.');
          }

          URL.revokeObjectURL(qualityCheckResult.url);
        } catch (qualityCheckError) {
          webGpuQualityCheckFailed = true;

          try {
            const wasmQualityCheckResult = await kokoroProvider.synthesizeWithRuntime({
              id: 'kokoro-quality-check',
              text: KOKORO_QUALITY_CHECK_SENTENCE,
            }, {}, 'wasm');

            if (!isAudioUrlResult(wasmQualityCheckResult)) {
              throw new Error('Kokoro WASM quality check returned a non-audio synthesis result.');
            }

            URL.revokeObjectURL(wasmQualityCheckResult.url);
            const errorMessage = qualityCheckError instanceof Error ? qualityCheckError.message : 'unknown_error';
            markWebGpuUnstableForCurrentProfile(errorMessage);
          } catch {
            throw qualityCheckError;
          }
        }

        if (webGpuQualityCheckFailed || kokoroProvider.getRuntimeDevice() === 'wasm') {
          console.warn(WEBGPU_QUALITY_CHECK_WARNING);
        }
      }

      const runtimeDevice = kokoroProvider.getRuntimeDevice();
      return {
        provider: kokoroProvider,
        providerType: 'kokoro',
        runtime: runtimeDevice,
        dtype: selectedDtype,
        fallbackToWebSpeech: false,
      };
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
      return createWebSpeechSelection({
        fallbackToWebSpeech: true,
        fallbackReason: fallbackError.message,
        fallbackError,
      });
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

  return createWebSpeechSelection({
    fallbackToWebSpeech: true,
    fallbackReason: fallbackError.message,
    fallbackError,
  });
};
