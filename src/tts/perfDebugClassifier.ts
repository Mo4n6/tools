import type { PerfMetricEvent } from './perfTelemetry';

export type PerfDebugCategory = 'runtime-warning' | 'fatal-playback-blocker';

export type PerfDebugEntry = {
  category: PerfDebugCategory;
  severity: 'info' | 'error';
  message: string;
  segmentId?: string;
};

const RUNTIME_WARNING_PATTERN = /(webgpu|ort|onnxruntime|runtime downgrade|fallback to wasm|switched to wasm)/i;
const FATAL_PLAYBACK_BLOCKER_PATTERN = /(audio playback failed:|empty blob|decode(?:\s|_|-)error|decode probe failed)/i;

export const isFatalPlaybackBlockerReason = (reason: string): boolean => (
  FATAL_PLAYBACK_BLOCKER_PATTERN.test(reason)
);

export const isRuntimeWarningReason = (reason: string): boolean => (
  RUNTIME_WARNING_PATTERN.test(reason)
);

export const classifyPerfDebugEvent = (event: PerfMetricEvent): PerfDebugEntry | null => {
  if (event.type === 'tts.runtime_downgrade') {
    return {
      category: 'runtime-warning',
      severity: 'info',
      message: event.reason,
      segmentId: event.segmentId,
    };
  }

  if (event.type !== 'tts.synth_failure') {
    return null;
  }

  if (isFatalPlaybackBlockerReason(event.reason)) {
    return {
      category: 'fatal-playback-blocker',
      severity: 'error',
      message: event.reason,
      segmentId: event.segmentId,
    };
  }

  if (isRuntimeWarningReason(event.reason)) {
    return {
      category: 'runtime-warning',
      severity: 'info',
      message: event.reason,
      segmentId: event.segmentId,
    };
  }

  return null;
};
