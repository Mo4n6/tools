import { describe, expect, it } from 'vitest';
import { classifyPerfDebugEvent, isFatalPlaybackBlockerReason, isRuntimeWarningReason } from './perfDebugClassifier';

describe('perfDebugClassifier', () => {
  it('classifies runtime downgrade events as informational runtime warnings', () => {
    const result = classifyPerfDebugEvent({
      type: 'tts.runtime_downgrade',
      transition: 'webgpu->wasm',
      reason: 'WebGPU output quality check failed; switched to WASM.',
      segmentId: 'seg-1',
    });

    expect(result).toEqual({
      category: 'runtime-warning',
      severity: 'info',
      message: 'WebGPU output quality check failed; switched to WASM.',
      segmentId: 'seg-1',
    });
  });

  it('treats WebGPU/ORT synth warnings as informational', () => {
    const result = classifyPerfDebugEvent({
      type: 'tts.synth_failure',
      segmentId: 'seg-2',
      reason: 'ORT WebGPU execution provider emitted a warning; switched to wasm.',
    });

    expect(result?.category).toBe('runtime-warning');
    expect(result?.severity).toBe('info');
  });

  it('surfaces audio.play rejection, empty blob, and decode failures as fatal playback blockers', () => {
    expect(isFatalPlaybackBlockerReason('Audio playback failed: NotAllowedError: play() failed')).toBe(true);
    expect(isFatalPlaybackBlockerReason('Audio decode probe failed: empty blob.')).toBe(true);
    expect(isFatalPlaybackBlockerReason('decode_error')).toBe(true);

    const classified = classifyPerfDebugEvent({
      type: 'tts.synth_failure',
      segmentId: 'seg-3',
      reason: 'Audio decode probe failed: empty blob.',
    });

    expect(classified?.category).toBe('fatal-playback-blocker');
    expect(classified?.severity).toBe('error');
  });

  it('does not mark unrelated synth failures as runtime warnings', () => {
    expect(isRuntimeWarningReason('KOKORO_MODEL_FETCH_FAILED')).toBe(false);
    expect(classifyPerfDebugEvent({
      type: 'tts.synth_failure',
      segmentId: 'seg-4',
      reason: 'Network timeout fetching model shard',
    })).toBeNull();
  });
});
