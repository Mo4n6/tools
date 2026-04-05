import { defaultChunkingPolicy, splitTextForSynthesisRetry } from '../domain/chunking/policy';
import { concatAudioBlobs } from './concatAudioBlobs';
import type { TTSAudioSynthesisResult, TTSSegment, TTSSynthesisOptions, TTSSynthesisResult, TTSProvider } from './types';

export const MIN_REASONABLE_AUDIO_SECONDS = 0.05;
export const SYNTHESIS_RETRY_MAX_ATTEMPTS = 3;
export const SYNTHESIS_RETRY_BACKOFF_BASE_MS = 180;
export const SYNTHESIS_MAX_SPLIT_DEPTH = 3;
const DEFAULT_TOKENS_PER_SECOND = 2.6;
const MIN_SPEECH_RATE = 0.5;
const MAX_SPEECH_RATE = 2.5;
const EXPECTED_DURATION_SAFETY_FACTOR = 0.25;
const PREEMPTIVE_SPLIT_MAX_CHARS = 420;
const PREEMPTIVE_SPLIT_MAX_TOKENS = 85;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildRegenerationExhaustedError(error: unknown): Error {
  const reason = toErrorMessage(error);
  return new Error(`regen_exhausted: ${reason}`);
}

export type SynthesisRetryEvent = {
  segmentId: string;
  attempt: number;
  maxAttempts: number;
  splitDepth: number;
  delayMs: number;
  reason: string;
};

export type SynthesisSplitEvent = {
  segmentId: string;
  splitDepth: number;
  chunkCount: number;
};

export type SynthesisRegeneratedEvent = {
  segmentId: string;
  splitDepth: number;
  chunkCount: number;
};

export type SynthesisRuntimeDowngradeEvent = {
  segmentId: string;
  reason: string;
};

export interface SynthesizeWithValidationParams {
  provider: TTSProvider;
  segment: TTSSegment;
  synthesisOptions?: TTSSynthesisOptions;
  splitDepth?: number;
  maxAttempts?: number;
  maxSplitDepth?: number;
  backoffBaseMs?: number;
  minReasonableAudioSeconds?: number;
  onRetry?: (event: SynthesisRetryEvent) => void;
  onSplit?: (event: SynthesisSplitEvent) => void;
  onRegenerated?: (event: SynthesisRegeneratedEvent) => void;
  onRuntimeDowngrade?: (event: SynthesisRuntimeDowngradeEvent) => void;
}

export function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function estimateTokenCount(text: string): number {
  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const roughTokenCount = Math.ceil(normalized.length / 4);
  return Math.max(wordCount, roughTokenCount);
}

export function estimateMinimumDurationSeconds(
  text: string,
  speechRate = 1,
  minReasonableAudioSeconds = MIN_REASONABLE_AUDIO_SECONDS,
): number {
  const clampedRate = Number.isFinite(speechRate)
    ? Math.min(MAX_SPEECH_RATE, Math.max(MIN_SPEECH_RATE, speechRate))
    : 1;
  const tokenCount = estimateTokenCount(text);
  if (tokenCount <= 0) {
    return minReasonableAudioSeconds;
  }

  const expectedDurationSeconds = tokenCount / (DEFAULT_TOKENS_PER_SECOND * clampedRate);
  const plausibilityFloor = expectedDurationSeconds * EXPECTED_DURATION_SAFETY_FACTOR;
  return Math.max(minReasonableAudioSeconds, plausibilityFloor);
}

export async function probePlayableAudio(
  result: TTSSynthesisResult,
  text: string,
  speechRate = 1,
  minReasonableAudioSeconds = MIN_REASONABLE_AUDIO_SECONDS,
): Promise<void> {
  if (!('blob' in result)) {
    return;
  }

  if (result.blob.size === 0) {
    throw new Error('Audio decode probe failed: empty blob.');
  }

  if (typeof AudioContext !== 'undefined') {
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await result.blob.arrayBuffer());
      const minimumExpectedDuration = estimateMinimumDurationSeconds(text, speechRate, minReasonableAudioSeconds);
      if (!Number.isFinite(decoded.duration) || decoded.duration < minimumExpectedDuration) {
        const decodedDuration = Number.isFinite(decoded.duration) ? decoded.duration.toFixed(3) : 'NaN';
        throw new Error(
          `Audio decode probe failed: duration_too_short decoded=${decodedDuration}s expected_min=${minimumExpectedDuration.toFixed(3)}s.`
        );
      }
    } finally {
      await context.close();
    }
  }
}

export async function synthesizeWithValidation({
  provider,
  segment,
  synthesisOptions,
  splitDepth = 0,
  maxAttempts = SYNTHESIS_RETRY_MAX_ATTEMPTS,
  maxSplitDepth = SYNTHESIS_MAX_SPLIT_DEPTH,
  backoffBaseMs = SYNTHESIS_RETRY_BACKOFF_BASE_MS,
  minReasonableAudioSeconds = MIN_REASONABLE_AUDIO_SECONDS,
  onRetry,
  onSplit,
  onRegenerated,
  onRuntimeDowngrade,
}: SynthesizeWithValidationParams): Promise<TTSSynthesisResult> {
  const runtimeAwareProvider = provider as TTSProvider & {
    getRuntimeDevice?: () => string;
  };
  const speakingRate = synthesisOptions?.rate ?? 1;

  const synthesizeWithProbe = async (targetSegment: TTSSegment): Promise<TTSSynthesisResult> => {
    const runtimeBeforeProbe = runtimeAwareProvider.getRuntimeDevice?.() ?? 'unknown';
    let result = await provider.synthesize(targetSegment, synthesisOptions);
    try {
      await probePlayableAudio(result, targetSegment.text, speakingRate, minReasonableAudioSeconds);
    } catch (probeError) {
      if (runtimeBeforeProbe !== 'webgpu') {
        throw probeError;
      }
      if (!provider.synthesizeWithRuntime) {
        throw probeError;
      }
      const reason = probeError instanceof Error ? probeError.message : String(probeError);
      onRuntimeDowngrade?.({ segmentId: targetSegment.id, reason });
      result = await provider.synthesizeWithRuntime(targetSegment, synthesisOptions, 'wasm');
      await probePlayableAudio(result, targetSegment.text, speakingRate, minReasonableAudioSeconds);
    }

    return result;
  };

  const maybePreemptivelySplit = (
    targetSegment: TTSSegment,
  ): string[] => {
    if (splitDepth > 0) {
      return [];
    }

    const normalizedText = targetSegment.text.trim();
    if (!normalizedText) {
      return [];
    }

    const estimatedTokens = estimateTokenCount(normalizedText);
    const exceedsSafeWindow = normalizedText.length > PREEMPTIVE_SPLIT_MAX_CHARS
      || estimatedTokens > PREEMPTIVE_SPLIT_MAX_TOKENS;
    if (!exceedsSafeWindow) {
      return [];
    }

    const proactivePolicy = {
      ...defaultChunkingPolicy,
      maxCharsPerChunk: PREEMPTIVE_SPLIT_MAX_CHARS,
      maxTokensPerChunk: PREEMPTIVE_SPLIT_MAX_TOKENS,
    };

    return splitTextForSynthesisRetry(normalizedText, proactivePolicy);
  };

  const stitchSubchunkResults = async (
    targetSegment: TTSSegment,
    subchunks: string[],
    nextSplitDepth: number,
  ): Promise<TTSSynthesisResult> => {
    onSplit?.({ segmentId: targetSegment.id, splitDepth, chunkCount: subchunks.length });
    const subResults = await Promise.all(
      subchunks.map((subchunk, index) => (
        synthesizeWithValidation({
          provider,
          segment: { id: `${targetSegment.id}::chunk_${index}`, text: subchunk },
          synthesisOptions,
          splitDepth: nextSplitDepth,
          maxAttempts,
          maxSplitDepth,
          backoffBaseMs,
          minReasonableAudioSeconds,
          onRetry,
          onSplit,
          onRegenerated,
          onRuntimeDowngrade,
        })
      ))
    );

    if (subResults.some((subResult) => !('blob' in subResult))) {
      throw new Error('Synthesis fallback returned non-audio result for at least one subchunk.');
    }

    const audioSubResults = subResults as TTSAudioSynthesisResult[];
    const stitchedBlob = await concatAudioBlobs(audioSubResults.map((subResult) => subResult.blob));
    const stitchedUrl = URL.createObjectURL(stitchedBlob);
    audioSubResults.forEach((subResult) => {
      if (subResult.url.startsWith('blob:')) {
        URL.revokeObjectURL(subResult.url);
      }
    });

    onRegenerated?.({ segmentId: targetSegment.id, splitDepth, chunkCount: subchunks.length });

    const stitchedResult: TTSAudioSynthesisResult = {
      segmentId: targetSegment.id,
      blob: stitchedBlob,
      url: stitchedUrl,
      mode: 'audio-url',
    };
    await probePlayableAudio(stitchedResult, targetSegment.text, speakingRate, minReasonableAudioSeconds);
    return stitchedResult;
  };

  const proactiveSubchunks = maybePreemptivelySplit(segment);
  if (proactiveSubchunks.length >= 2) {
    return stitchSubchunkResults(segment, proactiveSubchunks, splitDepth + 1);
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await synthesizeWithProbe(segment);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const backoffMs = backoffBaseMs * (2 ** (attempt - 1));
        onRetry?.({
          segmentId: segment.id,
          attempt,
          maxAttempts,
          splitDepth,
          delayMs: backoffMs,
          reason: toErrorMessage(error),
        });
        await delayMs(backoffMs);
      }
    }
  }

  if (splitDepth >= maxSplitDepth) {
    throw buildRegenerationExhaustedError(lastError);
  }

  const subchunks = splitTextForSynthesisRetry(segment.text);
  if (subchunks.length < 2) {
    throw buildRegenerationExhaustedError(lastError);
  }
  return stitchSubchunkResults(segment, subchunks, splitDepth + 1);
}
