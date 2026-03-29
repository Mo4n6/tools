import { TTSFallbackError } from './errors';

export type PerfMetricEvent =
  | {
    type: 'tts.model_load';
    provider: 'kokoro';
    device: 'wasm' | 'webgpu';
    model: string;
    durationMs: number;
    peakMemoryMb?: number;
    deviceMemoryGb?: number;
  }
  | {
    type: 'tts.first_audio';
    durationMs: number;
    segmentId: string;
  }
  | {
    type: 'tts.segment_synth';
    segmentId: string;
    durationMs: number;
  }
  | {
    type: 'tts.synth_failure';
    segmentId: string;
    reason: string;
  }
  | {
    type: 'tts.queue_underrun';
    segmentId: string;
    queueUnderruns: number;
    queueTransitions: number;
    underrunRate: number;
  }
  | {
    type: 'tts.degraded_mode';
    from: 'kokoro';
    to: 'web-speech';
    fallbackError: TTSFallbackError;
  };

export interface PerfTelemetrySink {
  log: (event: PerfMetricEvent) => void;
}

const readPeakMemoryMb = (): number | undefined => {
  if (typeof performance === 'undefined') {
    return undefined;
  }

  const withMemory = performance as Performance & {
    memory?: {
      usedJSHeapSize?: number;
      totalJSHeapSize?: number;
    };
  };

  if (!withMemory.memory) {
    return undefined;
  }

  const used = withMemory.memory.usedJSHeapSize ?? 0;
  const total = withMemory.memory.totalJSHeapSize ?? 0;
  const peakBytes = Math.max(used, total);
  return peakBytes > 0 ? Math.round((peakBytes / (1024 * 1024)) * 10) / 10 : undefined;
};

const defaultSink: PerfTelemetrySink = {
  log: (event) => {
    console.info('[perf]', event);
  },
};

export const setupLocalDebugPerfTelemetry = (): void => {
  if (!import.meta.env.DEV) {
    return;
  }

  let synthFailureCount = 0;
  let fallbackActivationCount = 0;

  perfTelemetry.sink = {
    log: (event) => {
      if (event.type === 'tts.synth_failure') {
        synthFailureCount += 1;
      }

      if (event.type === 'tts.degraded_mode') {
        fallbackActivationCount += 1;
      }

      if (event.type === 'tts.first_audio') {
        console.info('[perf][debug] time-to-first-audio(ms)', event.durationMs, event.segmentId);
        return;
      }

      if (event.type === 'tts.synth_failure') {
        console.info('[perf][debug] synth-failure-count', synthFailureCount, event.segmentId, event.reason);
        return;
      }

      if (event.type === 'tts.degraded_mode') {
        console.info('[perf][debug] fallback-activations', fallbackActivationCount, event.fallbackError);
        return;
      }

      console.info('[perf]', event);
    },
  };
};

export const perfTelemetry = {
  sink: defaultSink,
  now: () => performance.now(),
  readPeakMemoryMb,
};
