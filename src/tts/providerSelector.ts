import { KokoroDevice, KokoroProvider, KokoroProviderOptions } from './providers/kokoroProvider';
import { WebSpeechProvider } from './providers/webSpeechProvider';
import { DEFAULT_KOKORO_MODEL } from './modelArtifacts';
import { TTSProvider } from './types';

const DEFAULT_MEMORY_GB_THRESHOLD = 4;

const hasEnoughMemory = (minimumGb: number): boolean => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory !== 'number') {
    return true;
  }

  return memory >= minimumGb;
};

const canUseWebGPU = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return false;
  }

  const gpuNavigator = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
  const adapter = await gpuNavigator.gpu?.requestAdapter();
  return Boolean(adapter);
};

export interface TTSProviderSelectorOptions {
  preferredDevice?: KokoroDevice;
  kokoro?: KokoroProviderOptions;
  minimumMemoryGb?: number;
}

export const selectTTSProvider = async (
  options: TTSProviderSelectorOptions = {}
): Promise<TTSProvider> => {
  const minimumMemoryGb = options.minimumMemoryGb ?? DEFAULT_MEMORY_GB_THRESHOLD;

  const requestedDevice = options.preferredDevice ?? options.kokoro?.device ?? 'wasm';
  const shouldUseKokoro = hasEnoughMemory(minimumMemoryGb) &&
    (requestedDevice === 'wasm' || await canUseWebGPU());

  if (shouldUseKokoro) {
    return new KokoroProvider({
      model: options.kokoro?.model ?? DEFAULT_KOKORO_MODEL,
      device: requestedDevice,
    });
  }

  return new WebSpeechProvider();
};
