export type TTSFallbackCode =
  | 'KOKORO_MODULE_RESOLUTION_FAILED'
  | 'KOKORO_MODEL_FETCH_FAILED'
  | 'WEBGPU_UNAVAILABLE'
  | 'DEVICE_MEMORY_TOO_LOW'
  | 'KOKORO_WARMUP_FAILED'
  | 'UNKNOWN';

export interface TTSFallbackError {
  code: TTSFallbackCode;
  message: string;
  cause?: unknown;
  hints?: string[];
}

export interface ClassifyTTSFailureContext {
  error?: unknown;
  minimumMemoryGb?: number;
  availableMemoryGb?: number;
  requestedDevice?: 'wasm' | 'webgpu';
  hasNavigatorGpu?: boolean;
  webgpuAdapterAvailable?: boolean;
}

const toMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return '';
};

const MODEL_FETCH_PATTERNS = [
  /failed to fetch/i,
  /network/i,
  /model/i,
  /\b(url|uri)\b/i,
  /http\s*(error|status|404|403|500)/i,
];

const WEBGPU_PATTERNS = [
  /navigator\.gpu/i,
  /webgpu/i,
  /adapter/i,
  /requestadapter/i,
];

export const classifyTTSFailure = (
  error: unknown,
  context: ClassifyTTSFailureContext = {}
): TTSFallbackError => {
  const message = toMessage(error) || toMessage(context.error) || 'Unknown Kokoro failure.';

  if (message.includes("Failed to resolve module specifier 'kokoro-js'")) {
    return {
      code: 'KOKORO_MODULE_RESOLUTION_FAILED',
      message,
      cause: error,
      hints: ['Ensure kokoro-js is installed and resolvable by the bundler.'],
    };
  }

  if (MODEL_FETCH_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      code: 'KOKORO_MODEL_FETCH_FAILED',
      message,
      cause: error,
      hints: ['Check network connectivity and verify the Kokoro model URL is reachable.'],
    };
  }

  const webGpuUnavailableByContext = context.hasNavigatorGpu === false || context.webgpuAdapterAvailable === false;
  if (webGpuUnavailableByContext || WEBGPU_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      code: 'WEBGPU_UNAVAILABLE',
      message,
      cause: error,
      hints: ['Use wasm fallback or run in a browser/device with WebGPU support.'],
    };
  }

  if (
    typeof context.minimumMemoryGb === 'number'
    && typeof context.availableMemoryGb === 'number'
    && context.availableMemoryGb < context.minimumMemoryGb
  ) {
    return {
      code: 'DEVICE_MEMORY_TOO_LOW',
      message,
      cause: error,
      hints: [`Requires >= ${context.minimumMemoryGb}GB device memory.`],
    };
  }

  if (message && message !== 'Unknown Kokoro failure.') {
    return {
      code: 'KOKORO_WARMUP_FAILED',
      message,
      cause: error,
    };
  }

  return {
    code: 'UNKNOWN',
    message,
    cause: error,
  };
};
