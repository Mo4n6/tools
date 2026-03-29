import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { perfTelemetry } from '../../tts/perfTelemetry';
import type { TTSAudioSynthesisResult, TTSSynthesisOptions, TTSSynthesisResult, TTSProvider } from '../../tts/types';

export type PlayerMachineState = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'finished';
export type SegmentSynthesisStatus = 'idle' | 'queued' | 'loading' | 'ready' | 'error';

export interface PlayerSegment {
  id: string;
  text: string;
}

export interface QueueSegmentModel {
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
  synthesisOptions,
  prefetchCount = DEFAULT_LOOKAHEAD,
  persistKey = 'reader-player-cursor',
}: UsePlayerControllerParams): UsePlayerControllerResult {
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
  const transitioningRef = useRef(false);
  const firstAudioLoggedRef = useRef(false);
  const playRequestStartRef = useRef<number | null>(null);
  const queueTransitionCountRef = useRef(0);
  const queueUnderrunCountRef = useRef(0);

  const bumpQueueVersion = useCallback(() => {
    queueVersionRef.current += 1;
  }, []);

  const setQueueEntry = useCallback((entry: QueueSegmentModel) => {
    queueRef.current.set(entry.segmentId, entry);
    bumpQueueVersion();
  }, [bumpQueueVersion]);

  const queue = useMemo<QueueSegmentModel[]>(() => {
    void queueVersionRef.current;
    return segments.map((segment) => queueRef.current.get(segment.id) ?? {
      segmentId: segment.id,
      synthesisStatus: 'idle',
      audioUrl: null,
    });
  }, [segments, machine.currentSegmentIndex, machine.state, machine.charOffset]);

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

    const existing = queueRef.current.get(segment.id);
    if (existing?.synthesisStatus === 'ready') {
      if (existing.audioUrl) {
        return { segmentId: segment.id, blob: new Blob(), url: existing.audioUrl, mode: 'audio-url' };
      }
      if (existing.mode === 'native-spoken') {
        return { segmentId: segment.id, mode: 'native-spoken' };
      }
    }

    if (nextPrefetchInFlightRef.current.has(segment.id)) {
      return null;
    }

    nextPrefetchInFlightRef.current.add(segment.id);
    setQueueEntry({ segmentId: segment.id, synthesisStatus: 'loading', audioUrl: existing?.audioUrl ?? null });

    try {
      const synthStartedAt = perfTelemetry.now();
      const result = await provider.synthesize({ id: segment.id, text: segment.text }, synthesisOptions);
      perfTelemetry.sink.log({
        type: 'tts.segment_synth',
        segmentId: segment.id,
        durationMs: Math.round(perfTelemetry.now() - synthStartedAt),
      });
      setQueueEntry({
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
      setQueueEntry({ segmentId: segment.id, synthesisStatus: 'error', audioUrl: null, error: message });
      dispatch({ type: 'SET_ERROR', error: message });
      return null;
    } finally {
      nextPrefetchInFlightRef.current.delete(segment.id);
    }
  }, [provider, segments, setQueueEntry, synthesisOptions]);

  const prefetchUpcoming = useCallback(async (startIndex: number) => {
    const targetIndices = Array.from({ length: Math.max(0, prefetchCount) }, (_, offset) => startIndex + offset + 1)
      .filter((index) => index < segments.length);

    await Promise.all(targetIndices.map(async (index) => {
      const segment = segments[index];
      if (!segment) {
        return;
      }

      const existing = queueRef.current.get(segment.id);
      if (existing?.synthesisStatus === 'ready' || existing?.synthesisStatus === 'loading') {
        return;
      }

      setQueueEntry({ segmentId: segment.id, synthesisStatus: 'queued', audioUrl: existing?.audioUrl ?? null });
      await synthesizeSegment(index);

      const entry = queueRef.current.get(segment.id);
      if (entry?.audioUrl) {
        const preload = new Audio(entry.audioUrl);
        preload.preload = 'auto';
        preload.load();
      }
    }));
  }, [prefetchCount, segments, setQueueEntry, synthesizeSegment]);

  const cleanupAudio = useCallback(() => {
    if (!activeAudioRef.current) {
      return;
    }

    activeAudioRef.current.onended = null;
    activeAudioRef.current.ontimeupdate = null;
    activeAudioRef.current.pause();
    activeAudioRef.current = null;
  }, []);

  const playIndex = useCallback(async (segmentIndex: number, offset = 0) => {
    if (!segments.length) {
      dispatch({ type: 'SET_STATE', state: 'idle' });
      return;
    }

    const boundedIndex = Math.max(0, Math.min(segmentIndex, segments.length - 1));
    dispatch({ type: 'SET_STATE', state: 'loading' });
    dispatch({ type: 'RESET_ERROR' });
    if (!firstAudioLoggedRef.current && playRequestStartRef.current == null) {
      playRequestStartRef.current = perfTelemetry.now();
    }

    const segment = segments[boundedIndex];
    const result = await synthesizeSegment(boundedIndex);
    if (!result) {
      return;
    }

    if (result.mode === 'native-spoken') {
      if (!provider.playNative) {
        dispatch({ type: 'SET_ERROR', error: 'TTS provider cannot play native audio output.' });
        return;
      }

      dispatch({ type: 'SET_INDEX', index: boundedIndex });
      dispatch({ type: 'SET_CHAR_OFFSET', charOffset: 0 });
      await provider.playNative({ id: segment.id, text: segment.text }, synthesisOptions);
      dispatch({ type: 'SET_CHAR_OFFSET', charOffset: segment.text.length });

      const nextIndex = boundedIndex + 1;
      if (nextIndex >= segments.length) {
        dispatch({ type: 'SET_STATE', state: 'finished' });
        persistCursor(boundedIndex, segment.text.length);
        return;
      }

      dispatch({ type: 'SET_INDEX', index: nextIndex });
      persistCursor(nextIndex, 0);
      await playIndex(nextIndex, 0);
      return;
    }

    const audioResult = result as TTSAudioSynthesisResult;
    if (!audioResult.url) {
      return;
    }

    cleanupAudio();
    const audio = new Audio(audioResult.url);
    audio.preload = 'auto';

    audio.ontimeupdate = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      if (!duration) {
        return;
      }
      const ratio = Math.min(1, Math.max(0, audio.currentTime / duration));
      const charOffset = Math.floor(ratio * segment.text.length);
      dispatch({ type: 'SET_CHAR_OFFSET', charOffset });
      persistCursor(boundedIndex, charOffset);
    };

    audio.onended = () => {
      if (transitioningRef.current) {
        return;
      }
      transitioningRef.current = true;

      void (async () => {
        const nextIndex = boundedIndex + 1;
        if (nextIndex >= segments.length) {
          dispatch({ type: 'SET_STATE', state: 'finished' });
          persistCursor(boundedIndex, segment.text.length);
          transitioningRef.current = false;
          return;
        }

        dispatch({ type: 'SET_INDEX', index: nextIndex });
        persistCursor(nextIndex, 0);
        queueTransitionCountRef.current += 1;
        const nextSegment = segments[nextIndex];
        const nextQueueEntry = nextSegment ? queueRef.current.get(nextSegment.id) : undefined;
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

    if (offset > 0) {
      const duration = audio.duration;
      if (Number.isFinite(duration) && duration > 0 && segment.text.length > 0) {
        audio.currentTime = Math.min(duration, (offset / segment.text.length) * duration);
      }
      dispatch({ type: 'SET_CHAR_OFFSET', charOffset: offset });
    }

    await audio.play();
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
    await prefetchUpcoming(boundedIndex);
  }, [cleanupAudio, persistCursor, prefetchUpcoming, segments, synthesizeSegment]);

  const play = useCallback(async () => {
    await playIndex(machine.currentSegmentIndex, machine.charOffset);
  }, [machine.charOffset, machine.currentSegmentIndex, playIndex]);

  const pause = useCallback(() => {
    if (!activeAudioRef.current) {
      return;
    }

    activeAudioRef.current.pause();
    dispatch({ type: 'SET_STATE', state: 'paused' });
    persistCursor(machine.currentSegmentIndex, machine.charOffset);
  }, [machine.charOffset, machine.currentSegmentIndex, persistCursor]);

  const resume = useCallback(async () => {
    if (activeAudioRef.current && machine.state === 'paused') {
      await activeAudioRef.current.play();
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
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

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
