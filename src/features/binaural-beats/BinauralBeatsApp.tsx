// Binaural Beats — tone generation for sleep, focus and calm.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BinauralEngine, isWebAudioSupported } from './audioEngine';
import {
  BAND_INFO,
  BEAT_HZ_MAX,
  BEAT_HZ_MIN,
  CARRIER_HZ_MAX,
  CARRIER_HZ_MIN,
  DEFAULT_SETTINGS,
  NOISE_TYPES,
  PRESETS,
  TIMER_OPTIONS_MINUTES,
  applyPreset,
  bandForBeat,
  clampSettings,
  describeSettings,
  findMatchingPreset,
  formatRemaining,
  parseFavorites,
  parseSettings,
  type BinauralFavorite,
  type BinauralSettings,
  type NoiseType,
} from './presets';

const SETTINGS_STORAGE_KEY = 'binaural-beats.settings.v1';
const FAVORITES_STORAGE_KEY = 'binaural-beats.favorites.v1';
const TIMER_FADE_SECONDS = 10;
const MAX_FAVORITES = 24;

const readStorage = (key: string): unknown => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: unknown): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode, quota). Settings simply won't persist.
  }
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
};

const createFavoriteId = (): string => `fav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const cardClassName = 'rounded-xl border border-emerald-500/35 bg-[#07110a] p-4 shadow-lg shadow-black/20';
const labelClassName = 'block text-sm text-emerald-200/90';
const rangeClassName = 'mt-1 w-full accent-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';
const selectClassName = 'mt-1 w-full rounded-md border border-emerald-500/30 bg-[#0a160f] p-2 text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';
const secondaryButtonClassName = 'rounded-md border border-emerald-500/40 bg-[#07110a] px-2 py-1 text-xs text-emerald-100 hover:border-emerald-300/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-60';

type PlaybackStatus = 'idle' | 'starting' | 'playing' | 'fading';

const BinauralBeatsApp = (): JSX.Element => {
  const [settings, setSettings] = useState<BinauralSettings>(() => parseSettings(readStorage(SETTINGS_STORAGE_KEY)) ?? DEFAULT_SETTINGS);
  const [favorites, setFavorites] = useState<BinauralFavorite[]>(() => parseFavorites(readStorage(FAVORITES_STORAGE_KEY)));
  const [favoriteName, setFavoriteName] = useState('');
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [timerEndsAt, setTimerEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const engineRef = useRef<BinauralEngine | null>(null);
  const fadeTimeoutRef = useRef<number | null>(null);
  const stopTimeoutRef = useRef<number | null>(null);

  const webAudioSupported = useMemo(() => isWebAudioSupported(), []);
  const activePreset = useMemo(() => findMatchingPreset(settings), [settings]);
  const band = BAND_INFO[bandForBeat(settings.beatHz)];
  const isStarting = status === 'starting';
  const isPlaying = status === 'playing' || status === 'fading';
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    writeStorage(SETTINGS_STORAGE_KEY, settings);
  }, [settings]);

  useEffect(() => {
    writeStorage(FAVORITES_STORAGE_KEY, favorites);
  }, [favorites]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    // Also runs on the starting -> playing transition so edits made while the
    // context was resuming are applied.
    engineRef.current?.update(settings);
  }, [isPlaying, settings]);

  const clearTimers = useCallback((): void => {
    if (fadeTimeoutRef.current !== null) {
      window.clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
    if (stopTimeoutRef.current !== null) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  }, []);

  const stop = useCallback((): void => {
    clearTimers();
    engineRef.current?.stop();
    setStatus('idle');
    setTimerEndsAt(null);
  }, [clearTimers]);

  const scheduleTimer = useCallback((timerMinutes: number): void => {
    clearTimers();
    if (timerMinutes <= 0) {
      setTimerEndsAt(null);
      return;
    }
    const totalMs = timerMinutes * 60 * 1000;
    const fadeMs = Math.min(TIMER_FADE_SECONDS * 1000, totalMs);
    setTimerEndsAt(Date.now() + totalMs);
    fadeTimeoutRef.current = window.setTimeout(() => {
      setStatus('fading');
      engineRef.current?.fadeOut(fadeMs / 1000);
    }, totalMs - fadeMs);
    stopTimeoutRef.current = window.setTimeout(() => {
      engineRef.current?.stop();
      setStatus('idle');
      setTimerEndsAt(null);
    }, totalMs);
  }, [clearTimers]);

  const play = useCallback(async (): Promise<void> => {
    setError(null);
    setStatus('starting');
    const engine = engineRef.current ?? new BinauralEngine();
    engineRef.current = engine;
    try {
      await engine.start(settings);
      if (!engine.isRunning) {
        // Disposed (unmounted) while the context was resuming.
        return;
      }
      setStatus('playing');
      scheduleTimer(settingsRef.current.timerMinutes);
    } catch (startError) {
      setStatus('idle');
      setError(startError instanceof Error ? startError.message : 'Unable to start audio.');
    }
  }, [scheduleTimer, settings]);

  const togglePlayback = useCallback((): void => {
    if (isStarting) {
      return;
    }
    if (isPlaying) {
      stop();
    } else {
      void play();
    }
  }, [isPlaying, isStarting, play, stop]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== ' ' || isTypingTarget(event.target)) {
        return;
      }
      event.preventDefault();
      togglePlayback();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [togglePlayback]);

  useEffect(() => {
    if (timerEndsAt === null) {
      return;
    }
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => {
      window.clearInterval(interval);
    };
  }, [timerEndsAt]);

  useEffect(() => () => {
    clearTimers();
    engineRef.current?.dispose();
    engineRef.current = null;
  }, [clearTimers]);

  const updateSettings = (patch: Partial<BinauralSettings>): void => {
    setSettings((current) => clampSettings({ ...current, ...patch }));
  };

  // Replaces the whole settings object and, while playing, reschedules the
  // sleep timer if it changed. Any in-progress fade-out is cancelled so the
  // engine is audible again under the new timer.
  const applySettings = (next: BinauralSettings): void => {
    const clamped = clampSettings(next);
    setSettings(clamped);
    if (isPlaying && clamped.timerMinutes !== settings.timerMinutes) {
      engineRef.current?.cancelFade();
      setStatus('playing');
      scheduleTimer(clamped.timerMinutes);
    }
  };

  const handleTimerChange = (timerMinutes: number): void => {
    applySettings({ ...settings, timerMinutes });
  };

  const saveFavorite = (): void => {
    const name = favoriteName.trim() || describeSettings(settings);
    setFavorites((current) => [
      { id: createFavoriteId(), name: name.slice(0, 60), settings },
      ...current,
    ].slice(0, MAX_FAVORITES));
    setFavoriteName('');
  };

  const remainingMs = timerEndsAt === null ? null : Math.max(0, timerEndsAt - now);
  const statusLabels: Record<PlaybackStatus, string> = {
    idle: 'Idle',
    starting: 'Starting',
    playing: 'Playing',
    fading: 'Fading out',
  };
  const statusLabel = statusLabels[status];

  return (
    <div className="w-full p-2 font-mono text-emerald-100 md:p-4">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Binaural Beats</h1>
        <p className="mt-2 text-sm text-emerald-300/70">
          Binaural beat soundscapes for sleep, focus, and relaxation. Generated locally with Web Audio; nothing leaves the browser.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-emerald-200/90">
          <span>Status: <span className="font-semibold">{statusLabel}</span></span>
          <span>Band: <span className="font-semibold">{band.label}</span></span>
          <span>Beat: <span className="font-semibold">{settings.beatHz} Hz</span></span>
          <span>Carrier: <span className="font-semibold">{settings.carrierHz} Hz</span></span>
          {remainingMs !== null ? (
            <span>Timer: <span className="font-semibold">{formatRemaining(remainingMs)}</span></span>
          ) : null}
        </p>
      </header>

      {!webAudioSupported ? (
        <div className="mb-4 rounded-md border border-rose-700 bg-rose-950/40 px-3 py-2 text-sm text-rose-200" role="alert">
          This browser does not support Web Audio, so playback is unavailable.
        </div>
      ) : null}

      <div className="mb-4 rounded-md border border-amber-700 bg-amber-950/40 px-3 py-2 text-sm text-amber-200" role="status">
        Headphones required. Binaural beats only work when each ear hears its own tone. Keep volume low; this is not a substitute for medical treatment.
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-rose-700 bg-rose-950/40 px-3 py-2 text-sm text-rose-200" role="alert">
          Playback error: {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={cardClassName} aria-label="Presets">
          <h2 className="text-lg font-semibold">Soundscapes</h2>
          <p className="mt-1 text-xs text-emerald-300/70">Pick a target brainwave band. Adjust the mix afterwards if you like.</p>
          <div className="mt-3 grid gap-2">
            {PRESETS.map((preset) => {
              const isActive = activePreset?.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setSettings((current) => applyPreset(current, preset))}
                  className={`rounded-md border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    isActive
                      ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100 shadow-[0_0_0_1px_rgba(52,211,153,0.45),0_0_12px_rgba(16,185,129,0.25)]'
                      : 'border-emerald-500/25 bg-[#0a160f] text-emerald-300/90 hover:border-emerald-400/50 hover:bg-emerald-500/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{preset.name}</span>
                    <span className="rounded border border-emerald-500/30 bg-[#07110a] px-2 py-0.5 text-xs text-emerald-300/70">{preset.intent}</span>
                  </div>
                  <p className="mt-1 text-xs text-emerald-300/70">
                    {preset.bands.map((presetBand) => BAND_INFO[presetBand].label).join(' + ')} · {preset.settings.beatHz} Hz beat
                    {preset.settings.noiseType !== 'none' ? ` · ${preset.settings.noiseType} noise` : ''}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className={cardClassName} aria-label="Mix controls">
          <h2 className="text-lg font-semibold">Mix</h2>
          <p className="mt-1 text-xs text-emerald-300/70">
            {activePreset ? `Preset: ${activePreset.name}` : 'Custom mix'} · {band.label} ({band.rangeHz[0]}–{band.rangeHz[1]} Hz): {band.intent}
          </p>

          <label className={`mt-3 ${labelClassName}`} htmlFor="binaural-beat">
            Beat frequency: {settings.beatHz.toFixed(1)} Hz
          </label>
          <input
            id="binaural-beat"
            type="range"
            className={rangeClassName}
            min={BEAT_HZ_MIN}
            max={BEAT_HZ_MAX}
            step={0.5}
            value={settings.beatHz}
            onChange={(event) => updateSettings({ beatHz: Number(event.target.value) })}
          />

          <label className={`mt-3 ${labelClassName}`} htmlFor="binaural-carrier">
            Carrier tone: {settings.carrierHz} Hz
          </label>
          <input
            id="binaural-carrier"
            type="range"
            className={rangeClassName}
            min={CARRIER_HZ_MIN}
            max={CARRIER_HZ_MAX}
            step={5}
            value={settings.carrierHz}
            onChange={(event) => updateSettings({ carrierHz: Number(event.target.value) })}
          />

          <label className={`mt-3 ${labelClassName}`} htmlFor="binaural-tone-volume">
            Tone volume: {Math.round(settings.toneVolume * 100)}%
          </label>
          <input
            id="binaural-tone-volume"
            type="range"
            className={rangeClassName}
            min={0}
            max={1}
            step={0.01}
            value={settings.toneVolume}
            onChange={(event) => updateSettings({ toneVolume: Number(event.target.value) })}
          />

          <label className={`mt-3 ${labelClassName}`} htmlFor="binaural-noise-type">
            Background layer
          </label>
          <select
            id="binaural-noise-type"
            className={selectClassName}
            value={settings.noiseType}
            onChange={(event) => updateSettings({ noiseType: event.target.value as NoiseType })}
          >
            {NOISE_TYPES.map((noiseType) => (
              <option key={noiseType} value={noiseType}>
                {noiseType === 'none' ? 'None (isolated beat)' : `${noiseType[0]?.toUpperCase()}${noiseType.slice(1)} noise`}
              </option>
            ))}
          </select>

          <label className={`mt-3 ${labelClassName}`} htmlFor="binaural-noise-volume">
            Background volume: {Math.round(settings.noiseVolume * 100)}%
          </label>
          <input
            id="binaural-noise-volume"
            type="range"
            className={rangeClassName}
            min={0}
            max={1}
            step={0.01}
            value={settings.noiseVolume}
            disabled={settings.noiseType === 'none'}
            onChange={(event) => updateSettings({ noiseVolume: Number(event.target.value) })}
          />
        </section>

        <section className={cardClassName} aria-label="Player">
          <h2 className="text-lg font-semibold">Player</h2>

          <div className="mt-3 rounded-md border border-emerald-500/30 bg-[#0a160f] p-3 text-sm" aria-live="polite">
            <p>Status: <span className="font-semibold">{statusLabel}</span></p>
            <p className="mt-1 text-xs text-emerald-300/80">{describeSettings(settings)}</p>
            {remainingMs !== null ? (
              <p className="mt-1 text-xs text-emerald-300/80">Stops in {formatRemaining(remainingMs)} (10 s fade).</p>
            ) : null}
          </div>

          <button
            type="button"
            aria-label={isPlaying ? 'Stop playback' : 'Start playback'}
            className="mt-3 w-full rounded-md border border-emerald-400 bg-emerald-500/15 px-2 py-2 text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!webAudioSupported || isStarting}
            onClick={togglePlayback}
          >
            {isStarting ? 'Starting…' : isPlaying ? 'Stop' : 'Play'}
          </button>
          <p className="mt-1 text-xs text-emerald-300/70">Space toggles playback.</p>

          <label className={`mt-4 ${labelClassName}`} htmlFor="binaural-timer">
            Sleep timer
          </label>
          <select
            id="binaural-timer"
            className={selectClassName}
            value={settings.timerMinutes}
            onChange={(event) => handleTimerChange(Number(event.target.value))}
          >
            {TIMER_OPTIONS_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0 ? 'Off' : `${minutes} min`}
              </option>
            ))}
          </select>

          <h3 className="mt-5 font-semibold text-emerald-200">Favorites</h3>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              aria-label="Favorite name"
              placeholder={describeSettings(settings)}
              className="min-w-0 flex-1 rounded-md border border-emerald-500/30 bg-[#0a160f] p-2 text-sm text-emerald-100 placeholder:text-emerald-300/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              value={favoriteName}
              maxLength={60}
              onChange={(event) => setFavoriteName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveFavorite();
                }
              }}
            />
            <button type="button" className={secondaryButtonClassName} onClick={saveFavorite}>
              Save
            </button>
          </div>
          {favorites.length === 0 ? (
            <p className="mt-2 text-xs text-emerald-300/70">No favorites yet. Saved mixes stay in this browser only.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {favorites.map((favorite) => (
                <li key={favorite.id} className="flex items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-[#0a160f] px-2 py-1 text-xs">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-emerald-100 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    title={describeSettings(favorite.settings)}
                    onClick={() => applySettings(favorite.settings)}
                  >
                    {favorite.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete favorite ${favorite.name}`}
                    className="rounded border border-rose-400/60 bg-rose-950/30 px-2 py-0.5 text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                    onClick={() => setFavorites((current) => current.filter((entry) => entry.id !== favorite.id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default BinauralBeatsApp;
