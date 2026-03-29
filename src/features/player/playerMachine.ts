import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { perfTelemetry } from '../../tts/perfTelemetry';
import type { TTSAudioSynthesisResult, TTSSynthesisOptions, TTSSynthesisResult, TTSProvider } from '../../tts/types';

export type PlayerMachineState = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'finished';
export type SegmentSynthesisStatus = 'idle' | 'queued' | 'loading' | 'ready' | 'error';

export interface PlayerSegment {
  id: string;
  text: string;
}

export interface PlayerSeekAnchor {
  segmentId: string;
  playbackSegmentIndex: number;
  playbackCharOffset: number;
}

export interface QueueSegmentModel {
  cacheKey: string;
  segmentId: string;
  synthesisStatus: SegmentSynthesisStatus;
  audioUrl: string | null;
  mode?: TTSSynthesisResult['mode'];
  error?: string;
}

export interface PlayerResumeCursor {
  segmentIndex: number;
  charOffset: number;
}

interface PlayerInternalState {
  state: PlayerMachineState;
  currentSegmentIndex: number;
  charOffset: number;
  error: string | null;
}

type Action =
  | { type: 'SET_STATE'; state: PlayerMachineState }
  | { type: 'SET_INDEX'; index: number }
  | { type: 'SET_CHAR_OFFSET'; charOffset: number }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'RESET_ERROR' };

const DEFAULT_LOOKAHEAD = 2;
const UNKNOWN_PROVIDER_ID = 'unknown-provider';
const UNKNOWN_RUNTIME_SIGNATURE = 'unknown-runtime';
const MIN_REASONABLE_AUDIO_SECONDS = 0.05;

function getProviderId(provider: TTSProvider): string {
  const providerWithId = provider as TTSProvider & { providerId?: string; id?: string };
  if (typeof providerWithId.providerId === 'string' && providerWithId.providerId.length > 0) {
    return providerWithId.providerId;
  }
  if (typeof providerWithId.id === 'string' && providerWithId.id.length > 0) {
    return providerWithId.id;
  }
  return provider.constructor?.name || UNKNOWN_PROVIDER_ID;
}

function buildSynthesisCacheKey(
  providerId: string,
  providerRuntimeSignature: string,
  segmentId: string,
  segmentText: string,
  options?: TTSSynthesisOptions,
): string {
  const voice = options?.voice ?? '';
  const rate = options?.rate ?? '';
  const normalizedText = segmentText.trim();
  const fingerprint = `${normalizedText.length}:${normalizedText.slice(0, 24)}:${normalizedText.slice(-24)}`;
  return `${providerId}|${providerRuntimeSignature}|${segmentId}|${fingerprint}|${voice}|${rate}`;
}

function getProviderRuntimeSignature(provider: TTSProvider): string {
  const providerWithRuntime = provider as TTSProvider & {
    getRuntimeDevice?: () => string;
    runtimeDevice?: string;
    device?: string;
    dtype?: string;
  };
  const runtime = providerWithRuntime.getRuntimeDevice?.()
    ?? providerWithRuntime.runtimeDevice
    ?? providerWithRuntime.device
    ?? UNKNOWN_RUNTIME_SIGNATURE;
  const dtype = providerWithRuntime.dtype ?? 'unknown-dtype';
  return `${runtime}|${dtype}`;
}

async function probePlayableAudio(result: TTSSynthesisResult): Promise<void> {
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
      if (!Number.isFinite(decoded.duration) || decoded.duration < MIN_REASONABLE_AUDIO_SECONDS) {
        throw new Error('Audio decode probe failed: suspiciously short duration.');
      }
    } finally {
      await context.close();
    }
  }
}

function createInitialState(cursor?: PlayerResumeCursor): PlayerInternalState {
  return {
    state: 'idle',
    currentSegmentIndex: Math.max(0, cursor?.segmentIndex ?? 0),
    charOffset: Math.max(0, cursor?.charOffset ?? 0),
    error: null,
  };
}

function reducer(state: PlayerInternalState, action: Action): PlayerInternalState {
  switch (action.type) {
    case 'SET_STATE':
      return { ...state, state: action.state };
    case 'SET_INDEX':
      return { ...state, currentSegmentIndex: action.index, charOffset: 0 };
    case 'SET_CHAR_OFFSET':
      return { ...state, charOffset: action.charOffset };
    case 'SET_ERROR':
      return { ...state, state: 'error', error: action.error };
    case 'RESET_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

export interface UsePlayerControllerParams {
  provider: TTSProvider;
  segments: PlayerSegment[];
  seekAnchors?: PlayerSeekAnchor[];
  synthesisOptions?: TTSSynthesisOptions;
  prefetchCount?: number;
  persistKey?: string;
}

export interface UsePlayerControllerResult {
  state: PlayerMachineState;
  currentSegmentIndex: number;
  charOffset: number;
  queue: QueueSegmentModel[];
  error: string | null;
  play: () => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  seekSegment: (index: number, charOffset?: number) => Promise<void>;
}

export function usePlayerController({
  provider,
  segments,
  seekAnchors,
  synthesisOptions,
  prefetchCount = DEFAULT_LOOKAHEAD,
  persistKey = 'reader-player-cursor',
}: UsePlayerControllerParams): UsePlayerControllerResult {
  const anchors = useMemo<PlayerSeekAnchor[]>(() => {
    if (seekAnchors && seekAnchors.length > 0) {
      return seekAnchors;
    }

    return segments.map((segment, index) => ({
      segmentId: segment.id,
      playbackSegmentIndex: index,
      playbackCharOffset: 0,
    }));
  }, [seekAnchors, segments]);

  const initialCursor = useMemo<PlayerResumeCursor | undefined>(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    try {
      const raw = window.localStorage.getItem(persistKey);
      return raw ? (JSON.parse(raw) as PlayerResumeCursor) : undefined;
    } catch {
      return undefined;
    }
  }, [persistKey]);

  const [machine, dispatch] = useReducer(reducer, initialCursor, createInitialState);

  const queueRef = useRef<Map<string, QueueSegmentModel>>(new Map());
  const queueVersionRef = useRef(0);
  const nextPrefetchInFlightRef = useRef<Set<string>>(new Set());
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const transitioningRef = useRef(false);
  const firstAudioLoggedRef = useRef(false);
  const playRequestStartRef = useRef<number | null>(null);
  const queueTransitionCountRef = useRef(0);
  const queueUnderrunCountRef = useRef(0);
  const synthesisIdentityRef = useRef<string | null>(null);

  const bumpQueueVersion = useCallback(() => {
    queueVersionRef.current += 1;
  }, []);

  const providerId = getProviderId(provider);
  const providerRuntimeSignature = getProviderRuntimeSignature(provider);
  const getCacheKey = useCallback((segmentId: string, segmentText: string) => {
    return buildSynthesisCacheKey(providerId, providerRuntimeSignature, segmentId, segmentText, synthesisOptions);
  }, [providerId, providerRuntimeSignature, synthesisOptions]);

  const setQueueEntry = useCallback((entry: QueueSegmentModel) => {
    queueRef.current.set(entry.cacheKey, entry);
    bumpQueueVersion();
  }, [bumpQueueVersion]);

  const queue = useMemo<QueueSegmentModel[]>(() => {
    void queueVersionRef.current;
    return segments.map((segment) => {
      const cacheKey = getCacheKey(segment.id, segment.text);
      return queueRef.current.get(cacheKey) ?? {
        cacheKey,
        segmentId: segment.id,
        synthesisStatus: 'idle',
        audioUrl: null,
      };
    });
  }, [getCacheKey, segments, machine.currentSegmentIndex, machine.state, machine.charOffset]);

  const persistCursor = useCallback((segmentIndex: number, charOffset: number) => {
    if (typeof window === 'undefined') {
      return;
    }

    const payload: PlayerResumeCursor = {
      segmentIndex: Math.max(0, segmentIndex),
      charOffset: Math.max(0, charOffset),
    };
    window.localStorage.setItem(persistKey, JSON.stringify(payload));
  }, [persistKey]);

  const synthesizeSegment = useCallback(async (segmentIndex: number): Promise<TTSSynthesisResult | null> => {
    const segment = segments[segmentIndex];
    if (!segment) {
      return null;
    }

    const cacheKey = getCacheKey(segment.id, segment.text);
    const existing = queueRef.current.get(cacheKey);
    if (existing?.synthesisStatus === 'ready') {
      if (existing.audioUrl) {
        return { segmentId: segment.id, blob: new Blob(), url: existing.audioUrl, mode: 'audio-url' };
      }
      if (existing.mode === 'native-spoken') {
        return { segmentId: segment.id, mode: 'native-spoken' };
      }
    }

    if (nextPrefetchInFlightRef.current.has(cacheKey)) {
      return null;
    }

    nextPrefetchInFlightRef.current.add(cacheKey);
    setQueueEntry({ cacheKey, segmentId: segment.id, synthesisStatus: 'loading', audioUrl: existing?.audioUrl ?? null });

    try {
      const synthStartedAt = perfTelemetry.now();
      const runtimeAwareProvider = provider as TTSProvider & {
        getRuntimeDevice?: () => string;
      };
      const runtimeBeforeProbe = runtimeAwareProvider.getRuntimeDevice?.() ?? 'unknown';
      let result = await provider.synthesize({ id: segment.id, text: segment.text }, synthesisOptions);
      try {
        await probePlayableAudio(result);
      } catch (probeError) {
        if (runtimeBeforeProbe !== 'webgpu') {
          throw probeError;
        }
        if (!provider.synthesizeWithRuntime) {
          throw probeError;
        }
        result = await provider.synthesizeWithRuntime(
          { id: segment.id, text: segment.text },
          synthesisOptions,
          'wasm'
        );
        await probePlayableAudio(result);
      }
      perfTelemetry.sink.log({
        type: 'tts.segment_synth',
        segmentId: segment.id,
        durationMs: Math.round(perfTelemetry.now() - synthStartedAt),
      });
      setQueueEntry({
        cacheKey,
        segmentId: segment.id,
        synthesisStatus: 'ready',
        audioUrl: 'url' in result ? result.url : null,
        mode: result.mode,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to synthesize audio segment.';
      perfTelemetry.sink.log({
        type: 'tts.synth_failure',
        segmentId: segment.id,
        reason: message,
      });
      setQueueEntry({ cacheKey, segmentId: segment.id, synthesisStatus: 'error', audioUrl: null, error: message });
      dispatch({ type: 'SET_ERROR', error: message });
      return null;
    } finally {
      nextPrefetchInFlightRef.current.delete(cacheKey);
    }
  }, [getCacheKey, provider, segments, setQueueEntry, synthesisOptions]);

  const prefetchUpcoming = useCallback(async (startIndex: number) => {
    const targetIndices = Array.from({ length: Math.max(0, prefetchCount) }, (_, offset) => startIndex + offset + 1)
      .filter((index) => index < segments.length);

    await Promise.all(targetIndices.map(async (index) => {
      const segment = segments[index];
      if (!segment) {
        return;
      }

      const cacheKey = getCacheKey(segment.id, segment.text);
      const existing = queueRef.current.get(cacheKey);
      if (existing?.synthesisStatus === 'ready' || existing?.synthesisStatus === 'loading') {
        return;
      }

      setQueueEntry({ cacheKey, segmentId: segment.id, synthesisStatus: 'queued', audioUrl: existing?.audioUrl ?? null });
      await synthesizeSegment(index);

      const entry = queueRef.current.get(cacheKey);
      if (entry?.audioUrl) {
        const preload = new Audio(entry.audioUrl);
        preload.preload = 'auto';
        preload.load();
      }
    }));
  }, [getCacheKey, prefetchCount, segments, setQueueEntry, synthesizeSegment]);

  const cleanupAudio = useCallback(() => {
    if (!activeAudioRef.current) {
      return;
    }

    activeAudioRef.current.onended = null;
    activeAudioRef.current.ontimeupdate = null;
    activeAudioRef.current.pause();
    activeAudioRef.current = null;
  }, []);

  const cleanupNativeSpeech = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      activeUtteranceRef.current = null;
      return;
    }

    if (activeUtteranceRef.current) {
      activeUtteranceRef.current.onstart = null;
      activeUtteranceRef.current.onend = null;
      activeUtteranceRef.current.onerror = null;
    }

    window.speechSynthesis.cancel();
    activeUtteranceRef.current = null;
  }, []);

  const playIndex = useCallback(async (segmentIndex: number, offset = 0) => {
    if (!segments.length) {
      dispatch({ type: 'SET_STATE', state: 'idle' });
      return;
    }

    if (!anchors.length) {
      dispatch({ type: 'SET_STATE', state: 'idle' });
      return;
    }

    const boundedIndex = Math.max(0, Math.min(segmentIndex, anchors.length - 1));
    const boundedAnchor = anchors[boundedIndex];
    if (!boundedAnchor) {
      dispatch({ type: 'SET_STATE', state: 'idle' });
      return;
    }

    const playbackIndex = Math.max(0, Math.min(boundedAnchor.playbackSegmentIndex, segments.length - 1));
    dispatch({ type: 'SET_STATE', state: 'loading' });
    dispatch({ type: 'RESET_ERROR' });
    if (!firstAudioLoggedRef.current && playRequestStartRef.current == null) {
      playRequestStartRef.current = perfTelemetry.now();
    }

    const segment = segments[playbackIndex];
    if (!segment) {
      dispatch({ type: 'SET_STATE', state: 'idle' });
      return;
    }
    const absoluteOffset = Math.max(0, boundedAnchor.playbackCharOffset + offset);
    const result = await synthesizeSegment(playbackIndex);
    if (!result) {
      return;
    }

    if (result.mode === 'native-spoken') {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        dispatch({ type: 'SET_ERROR', error: 'TTS provider cannot play native audio output.' });
        return;
      }

      cleanupAudio();
      cleanupNativeSpeech();

      const utterance = new SpeechSynthesisUtterance(segment.text);
      utterance.rate = synthesisOptions?.rate ?? 1;
      utterance.pitch = synthesisOptions?.pitch ?? 1;
      if (synthesisOptions?.voice) {
        const nativeVoice = window.speechSynthesis.getVoices().find((voice) => voice.voiceURI === synthesisOptions.voice);
        if (nativeVoice) {
          utterance.voice = nativeVoice;
        }
      }

      dispatch({ type: 'SET_INDEX', index: boundedIndex });
      dispatch({ type: 'SET_CHAR_OFFSET', charOffset: Math.max(0, offset) });

      utterance.onstart = () => {
        dispatch({ type: 'SET_STATE', state: 'playing' });
        if (!firstAudioLoggedRef.current && playRequestStartRef.current != null) {
          perfTelemetry.sink.log({
            type: 'tts.first_audio',
            durationMs: Math.round(perfTelemetry.now() - playRequestStartRef.current),
            segmentId: segment.id,
          });
          firstAudioLoggedRef.current = true;
          playRequestStartRef.current = null;
        }
      };

      utterance.onerror = (event) => {
        const message = event.error || 'Native speech synthesis failed.';
        dispatch({ type: 'SET_ERROR', error: message });
      };

      utterance.onend = () => {
        if (transitioningRef.current) {
          return;
        }
        transitioningRef.current = true;
        activeUtteranceRef.current = null;
        dispatch({ type: 'SET_CHAR_OFFSET', charOffset: segment.text.length });

        void (async () => {
          const nextIndex = boundedIndex + 1;
          if (nextIndex >= anchors.length) {
            dispatch({ type: 'SET_STATE', state: 'finished' });
            persistCursor(boundedIndex, Math.max(0, segment.text.length - boundedAnchor.playbackCharOffset));
            transitioningRef.current = false;
            return;
          }

          dispatch({ type: 'SET_INDEX', index: nextIndex });
          persistCursor(nextIndex, 0);
          queueTransitionCountRef.current += 1;
          const nextAnchor = anchors[nextIndex];
          const nextSegment = nextAnchor ? segments[nextAnchor.playbackSegmentIndex] : undefined;
          const nextQueueEntry = nextSegment ? queueRef.current.get(getCacheKey(nextSegment.id, nextSegment.text)) : undefined;
          if (nextSegment && nextQueueEntry?.synthesisStatus !== 'ready') {
            queueUnderrunCountRef.current += 1;
            perfTelemetry.sink.log({
              type: 'tts.queue_underrun',
              segmentId: nextSegment.id,
              queueUnderruns: queueUnderrunCountRef.current,
              queueTransitions: queueTransitionCountRef.current,
              underrunRate: queueUnderrunCountRef.current / queueTransitionCountRef.current,
            });
          }
          await playIndex(nextIndex, 0);
          transitioningRef.current = false;
        })();
      };

      activeUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      await prefetchUpcoming(playbackIndex);
      return;
    }

    const audioResult = result as TTSAudioSynthesisResult;
    if (!audioResult.url) {
      return;
    }

    cleanupNativeSpeech();
    cleanupAudio();
    const audio = new Audio(audioResult.url);
    audio.preload = 'auto';

    audio.ontimeupdate = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      if (!duration) {
        return;
      }
      const ratio = Math.min(1, Math.max(0, audio.currentTime / duration));
      const playbackCharOffset = Math.floor(ratio * segment.text.length);
      const activeAnchorIndex = anchors.reduce((activeIndex, anchor, index) => {
        if (
          anchor.playbackSegmentIndex === playbackIndex
          && anchor.playbackCharOffset <= playbackCharOffset
          && index >= activeIndex
        ) {
          return index;
        }
        return activeIndex;
      }, boundedIndex);
      const activeAnchor = anchors[activeAnchorIndex];
      const anchorOffset = activeAnchor && activeAnchor.playbackSegmentIndex === playbackIndex
        ? Math.max(0, playbackCharOffset - activeAnchor.playbackCharOffset)
        : playbackCharOffset;
      dispatch({ type: 'SET_INDEX', index: activeAnchorIndex });
      dispatch({ type: 'SET_CHAR_OFFSET', charOffset: anchorOffset });
      persistCursor(activeAnchorIndex, anchorOffset);
    };

    audio.onended = () => {
      if (transitioningRef.current) {
        return;
      }
      transitioningRef.current = true;

      void (async () => {
        const nextIndex = boundedIndex + 1;
        if (nextIndex >= anchors.length) {
          dispatch({ type: 'SET_STATE', state: 'finished' });
          persistCursor(boundedIndex, Math.max(0, segment.text.length - boundedAnchor.playbackCharOffset));
          transitioningRef.current = false;
          return;
        }

        dispatch({ type: 'SET_INDEX', index: nextIndex });
        persistCursor(nextIndex, 0);
        queueTransitionCountRef.current += 1;
        const nextAnchor = anchors[nextIndex];
        const nextSegment = nextAnchor ? segments[nextAnchor.playbackSegmentIndex] : undefined;
        const nextQueueEntry = nextSegment ? queueRef.current.get(getCacheKey(nextSegment.id, nextSegment.text)) : undefined;
        if (nextSegment && nextQueueEntry?.synthesisStatus !== 'ready') {
          queueUnderrunCountRef.current += 1;
          perfTelemetry.sink.log({
            type: 'tts.queue_underrun',
            segmentId: nextSegment.id,
            queueUnderruns: queueUnderrunCountRef.current,
            queueTransitions: queueTransitionCountRef.current,
            underrunRate: queueUnderrunCountRef.current / queueTransitionCountRef.current,
          });
        }
        await playIndex(nextIndex, 0);
        transitioningRef.current = false;
      })();
    };

    activeAudioRef.current = audio;
    dispatch({ type: 'SET_INDEX', index: boundedIndex });

    if (absoluteOffset > 0) {
      const duration = audio.duration;
      if (Number.isFinite(duration) && duration > 0 && segment.text.length > 0) {
        audio.currentTime = Math.min(duration, (absoluteOffset / segment.text.length) * duration);
      }
      dispatch({ type: 'SET_CHAR_OFFSET', charOffset: offset });
    }

    try {
      await audio.play();
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      const errorMessage = error instanceof Error ? error.message : String(error);
      const blobMimeType = audioResult.blob?.type || null;
      const playbackErrorMessage = `Audio playback failed: ${errorName}: ${errorMessage}`;

      console.error('Audio playback failed.', {
        errorName,
        errorMessage,
        provider: providerId,
        runtime: providerRuntimeSignature,
        voice: synthesisOptions?.voice ?? null,
        rate: synthesisOptions?.rate ?? null,
        audioUrl: audioResult.url ?? null,
        blobMimeType,
      });
      perfTelemetry.sink.log({
        type: 'tts.synth_failure',
        segmentId: segment.id,
        reason: playbackErrorMessage,
      });
      dispatch({ type: 'SET_ERROR', error: playbackErrorMessage });
      return;
    }
    if (!firstAudioLoggedRef.current && playRequestStartRef.current != null) {
      perfTelemetry.sink.log({
        type: 'tts.first_audio',
        durationMs: Math.round(perfTelemetry.now() - playRequestStartRef.current),
        segmentId: segment.id,
      });
      firstAudioLoggedRef.current = true;
      playRequestStartRef.current = null;
    }
    dispatch({ type: 'SET_STATE', state: 'playing' });
    await prefetchUpcoming(playbackIndex);
  }, [
    anchors,
    cleanupAudio,
    cleanupNativeSpeech,
    getCacheKey,
    persistCursor,
    prefetchUpcoming,
    providerId,
    providerRuntimeSignature,
    segments,
    synthesizeSegment,
    synthesisOptions,
  ]);

  const play = useCallback(async () => {
    await playIndex(machine.currentSegmentIndex, machine.charOffset);
  }, [machine.charOffset, machine.currentSegmentIndex, playIndex]);

  const pause = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      dispatch({ type: 'SET_STATE', state: 'paused' });
      persistCursor(machine.currentSegmentIndex, machine.charOffset);
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window && activeUtteranceRef.current) {
      window.speechSynthesis.pause();
      dispatch({ type: 'SET_STATE', state: 'paused' });
      persistCursor(machine.currentSegmentIndex, machine.charOffset);
    }
  }, [machine.charOffset, machine.currentSegmentIndex, persistCursor]);

  const resume = useCallback(async () => {
    if (activeAudioRef.current && machine.state === 'paused') {
      await activeAudioRef.current.play();
      dispatch({ type: 'SET_STATE', state: 'playing' });
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window && activeUtteranceRef.current && machine.state === 'paused') {
      window.speechSynthesis.resume();
      dispatch({ type: 'SET_STATE', state: 'playing' });
      return;
    }

    await playIndex(machine.currentSegmentIndex, machine.charOffset);
  }, [machine.charOffset, machine.currentSegmentIndex, machine.state, playIndex]);

  const seekSegment = useCallback(async (index: number, charOffset = 0) => {
    dispatch({ type: 'SET_INDEX', index });
    dispatch({ type: 'SET_CHAR_OFFSET', charOffset });
    persistCursor(index, charOffset);
    await playIndex(index, charOffset);
  }, [persistCursor, playIndex]);

  const skipNext = useCallback(async () => {
    await seekSegment(machine.currentSegmentIndex + 1, 0);
  }, [machine.currentSegmentIndex, seekSegment]);

  const skipPrevious = useCallback(async () => {
    await seekSegment(machine.currentSegmentIndex - 1, 0);
  }, [machine.currentSegmentIndex, seekSegment]);

  useEffect(() => {
    persistCursor(machine.currentSegmentIndex, machine.charOffset);
  }, [machine.charOffset, machine.currentSegmentIndex, persistCursor]);

  useEffect(() => {
    const synthesisIdentity = JSON.stringify({
      providerId,
      providerRuntimeSignature,
      voice: synthesisOptions?.voice ?? null,
      rate: synthesisOptions?.rate ?? null,
    });

    if (synthesisIdentityRef.current === null) {
      synthesisIdentityRef.current = synthesisIdentity;
      return;
    }

    if (synthesisIdentityRef.current === synthesisIdentity) {
      return;
    }

    synthesisIdentityRef.current = synthesisIdentity;
    transitioningRef.current = false;
    cleanupAudio();
    cleanupNativeSpeech();
    nextPrefetchInFlightRef.current.clear();
    queueRef.current.forEach((entry) => {
      if (entry.audioUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(entry.audioUrl);
      }
    });
    queueRef.current.clear();
    bumpQueueVersion();
    dispatch({ type: 'SET_STATE', state: 'idle' });
    dispatch({ type: 'RESET_ERROR' });
  }, [bumpQueueVersion, cleanupAudio, cleanupNativeSpeech, providerId, providerRuntimeSignature, synthesisOptions?.rate, synthesisOptions?.voice]);

  useEffect(() => {
    return () => {
      cleanupAudio();
      cleanupNativeSpeech();
    };
  }, [cleanupAudio, cleanupNativeSpeech]);

  return {
    state: machine.state,
    currentSegmentIndex: machine.currentSegmentIndex,
    charOffset: machine.charOffset,
    queue,
    error: machine.error,
    play,
    pause,
    resume,
    skipNext,
    skipPrevious,
    seekSegment,
  };
}

export interface CurrentSegmentHighlight {
  segmentIndex: number;
  segmentId: string | null;
  charOffset: number;
  ratio: number;
}

export function useCurrentSegmentHighlight(
  controller: Pick<UsePlayerControllerResult, 'currentSegmentIndex' | 'charOffset'>,
  segments: PlayerSegment[],
): CurrentSegmentHighlight {
  const segmentIndex = Math.max(0, Math.min(controller.currentSegmentIndex, Math.max(segments.length - 1, 0)));
  const segment = segments[segmentIndex];
  const charOffset = Math.max(0, controller.charOffset);
  const ratio = segment?.text.length ? Math.min(1, charOffset / segment.text.length) : 0;

  return {
    segmentIndex,
    segmentId: segment?.id ?? null,
    charOffset,
    ratio,
  };
}
