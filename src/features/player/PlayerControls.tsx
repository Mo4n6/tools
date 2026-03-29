import { useEffect, useMemo, useState } from 'react';
import type { PlayerMachineState } from './playerMachine';
import type { PlaybackMode } from '../../domain/segments';

type PlayerControlsProps = {
  queueStatus: PlayerMachineState;
  currentSegmentIndex: number;
  segmentCount: number;
  machineError: string | null;
  voice: string;
  voices: Array<{ id: string; name: string; language?: string; provider: string }>;
  selectedLanguage: string;
  languageOptions: Array<{ value: string; label: string }>;
  rate: number;
  playbackMode: PlaybackMode;
  isVoiceReadyForPlayback?: boolean;
  voiceReadinessHelperText?: string | null;
  playDisabled?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrevSegment: () => void;
  onNextSegment: () => void;
  onSeekSegmentStart: () => void;
  onVoiceChange: (voice: string) => void;
  onLanguageChange: (language: string) => void;
  onRateChange: (rate: number) => void;
  onPlaybackModeChange: (mode: PlaybackMode) => void;
};

const RATE_MIN = 0.5;
const RATE_MAX = 2;
const RATE_STEP = 0.1;

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
};

export function PlayerControls({
  queueStatus,
  currentSegmentIndex,
  segmentCount,
  machineError,
  voice,
  voices,
  selectedLanguage,
  languageOptions,
  rate,
  playbackMode,
  isVoiceReadyForPlayback = true,
  voiceReadinessHelperText = null,
  playDisabled = false,
  onPlay,
  onPause,
  onPrevSegment,
  onNextSegment,
  onSeekSegmentStart,
  onVoiceChange,
  onLanguageChange,
  onRateChange,
  onPlaybackModeChange,
}: PlayerControlsProps) {
  const [liveMessage, setLiveMessage] = useState('Playback idle.');
  const isPlaying = queueStatus === 'playing' || queueStatus === 'loading';
  const canPlay = !playDisabled;
  const progressText = useMemo(() => {
    if (segmentCount === 0) {
      return '0 / 0';
    }

    return `${currentSegmentIndex + 1} / ${segmentCount}`;
  }, [currentSegmentIndex, segmentCount]);

  useEffect(() => {
    const statusLabel = queueStatus === 'playing' ? 'Playback started.' : `Playback ${queueStatus}.`;
    setLiveMessage(`${statusLabel} Segment ${progressText}.`);
  }, [progressText, queueStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        if (!canPlay) {
          return;
        }

        if (isPlaying) {
          onPause();
        } else {
          onPlay();
        }
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrevSegment();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNextSegment();
        return;
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        onRateChange(Math.min(RATE_MAX, Number((rate + RATE_STEP).toFixed(1))));
        return;
      }

      if (event.key === '-') {
        event.preventDefault();
        onRateChange(Math.max(RATE_MIN, Number((rate - RATE_STEP).toFixed(1))));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [canPlay, isPlaying, onNextSegment, onPause, onPlay, onPrevSegment, onRateChange, rate]);

  return (
    <div className="mt-3 space-y-3" aria-label="Player controls">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </p>

      <label className="block text-sm text-emerald-200/90" htmlFor="voice-picker">
        Voice selector
      </label>
      <label className="block text-sm text-emerald-200/90" htmlFor="language-picker">
        Language selector
      </label>
      <select
        id="language-picker"
        aria-label="Language selector"
        className="w-full rounded-md border border-emerald-500/30 bg-[#0a160f] p-2 text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        value={selectedLanguage}
        onChange={(event) => onLanguageChange(event.target.value)}
      >
        {languageOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        id="voice-picker"
        aria-label="Voice selector"
        className="w-full rounded-md border border-emerald-500/30 bg-[#0a160f] p-2 text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        value={voice}
        disabled={voices.length === 0}
        onChange={(event) => onVoiceChange(event.target.value)}
      >
        {voices.length === 0 ? (
          <option value={voice}>No voices available</option>
        ) : (
          voices.map((providerVoice) => (
            <option key={providerVoice.id} value={providerVoice.id}>
              {providerVoice.name} ({providerVoice.language ?? 'und'}) [{providerVoice.provider}]
            </option>
          ))
        )}
      </select>
      {import.meta.env.DEV ? (
        <p className="text-xs text-emerald-300/70" aria-live="polite">
          Selected voice.id: <span className="font-mono text-emerald-100">{voice}</span>
        </p>
      ) : null}
      {!isVoiceReadyForPlayback && voiceReadinessHelperText ? (
        <p className="text-xs text-amber-300" role="status">
          {voiceReadinessHelperText}
        </p>
      ) : null}

      <label className="block text-sm text-emerald-200/90" htmlFor="rate-control">
        Rate control: {rate.toFixed(1)}x
      </label>
      <input
        id="rate-control"
        aria-label="Rate control"
        className="w-full accent-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        type="range"
        min={RATE_MIN}
        max={RATE_MAX}
        step={RATE_STEP}
        value={rate}
        onChange={(event) => onRateChange(Number(event.target.value))}
      />

      <label className="block text-sm text-emerald-200/90" htmlFor="playback-mode-control">
        Playback mode
      </label>
      <select
        id="playback-mode-control"
        aria-label="Playback mode"
        className="w-full rounded-md border border-emerald-500/30 bg-[#0a160f] p-2 text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        value={playbackMode}
        onChange={(event) => onPlaybackModeChange(event.target.value as PlaybackMode)}
      >
        <option value="segmented">Segmented</option>
        <option value="continuous">Continuous</option>
      </select>

      <div
        className="rounded-md border border-emerald-500/30 bg-[#0a160f] p-3 text-sm"
        aria-live="polite"
        aria-label={`Progress indicator, segment ${progressText}`}
      >
        <p>
          Status: <span className="font-semibold capitalize">{queueStatus}</span>
        </p>
        <p>Progress: {progressText}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          aria-label="Skip to previous segment"
          className="rounded-md border border-emerald-500/40 bg-[#07110a] px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          onClick={onPrevSegment}
          type="button"
        >
          ◀ Prev
        </button>
        <button
          aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
          className="rounded-md border border-emerald-400 bg-emerald-500/15 px-2 py-1 text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          disabled={!isPlaying && !canPlay}
          onClick={() => {
            if (isPlaying) {
              onPause();
            } else {
              if (!canPlay) {
                return;
              }
              onPlay();
            }
          }}
          type="button"
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          aria-label="Skip to next segment"
          className="rounded-md border border-emerald-500/40 bg-[#07110a] px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          onClick={onNextSegment}
          type="button"
        >
          Next ▶
        </button>
      </div>

      <button
        aria-label="Seek to current segment start"
        className="w-full rounded-md border border-emerald-500/40 bg-[#07110a] px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        onClick={onSeekSegmentStart}
        type="button"
      >
        Restart Current Segment
      </button>

      {machineError ? (
        <p className="rounded border border-rose-700 bg-rose-950/40 p-2 text-xs text-rose-200" role="alert">
          Playback error: {machineError}
        </p>
      ) : null}

      <p className="text-xs text-emerald-300/70">
        Shortcuts: Space (play/pause), ArrowLeft/ArrowRight (skip), +/- (rate)
      </p>
    </div>
  );
}
