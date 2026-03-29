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
    reason: string;
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

export const perfTelemetry = {
  sink: defaultSink,
  now: () => performance.now(),
  readPeakMemoryMb,
};
