export type NoiseType = 'none' | 'white' | 'pink' | 'brown';

export type BrainwaveBand = 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma';

export type MoongateSettings = {
  carrierHz: number;
  beatHz: number;
  toneVolume: number;
  noiseType: NoiseType;
  noiseVolume: number;
  timerMinutes: number;
};

export type MoongatePreset = {
  id: string;
  name: string;
  intent: string;
  bands: BrainwaveBand[];
  settings: Pick<MoongateSettings, 'carrierHz' | 'beatHz' | 'noiseType'>;
};

export type MoongateFavorite = {
  id: string;
  name: string;
  settings: MoongateSettings;
};

export const CARRIER_HZ_MIN = 80;
export const CARRIER_HZ_MAX = 600;
export const BEAT_HZ_MIN = 0.5;
export const BEAT_HZ_MAX = 40;
export const VOLUME_MIN = 0;
export const VOLUME_MAX = 1;
export const TIMER_MINUTES_MIN = 0;
export const TIMER_MINUTES_MAX = 480;

export const TIMER_OPTIONS_MINUTES = [0, 15, 30, 45, 60, 90, 120] as const;

export const NOISE_TYPES: NoiseType[] = ['none', 'white', 'pink', 'brown'];

export const BAND_INFO: Record<BrainwaveBand, { label: string; rangeHz: [number, number]; intent: string }> = {
  delta: { label: 'Delta', rangeHz: [0.5, 4], intent: 'Deep sleep' },
  theta: { label: 'Theta', rangeHz: [4, 8], intent: 'Meditation, drowsiness' },
  alpha: { label: 'Alpha', rangeHz: [8, 12], intent: 'Relaxed wakefulness' },
  beta: { label: 'Beta', rangeHz: [12, 30], intent: 'Active focus' },
  gamma: { label: 'Gamma', rangeHz: [30, 40], intent: 'Peak concentration' },
};

export const DEFAULT_SETTINGS: MoongateSettings = {
  carrierHz: 200,
  beatHz: 6,
  toneVolume: 0.5,
  noiseType: 'none',
  noiseVolume: 0.3,
  timerMinutes: 0,
};

export const PRESETS: MoongatePreset[] = [
  {
    id: 'deep-sleep',
    name: 'Deep Sleep',
    intent: 'Sleep',
    bands: ['delta'],
    settings: { carrierHz: 160, beatHz: 2, noiseType: 'brown' },
  },
  {
    id: 'drift-off',
    name: 'Drift Off',
    intent: 'Sleep',
    bands: ['delta', 'theta'],
    settings: { carrierHz: 180, beatHz: 3.5, noiseType: 'pink' },
  },
  {
    id: 'meditate',
    name: 'Meditate',
    intent: 'Meditation',
    bands: ['theta'],
    settings: { carrierHz: 200, beatHz: 6, noiseType: 'none' },
  },
  {
    id: 'unwind',
    name: 'Unwind',
    intent: 'Stress relief',
    bands: ['theta', 'alpha'],
    settings: { carrierHz: 220, beatHz: 8, noiseType: 'pink' },
  },
  {
    id: 'calm-alert',
    name: 'Calm Alert',
    intent: 'Relax',
    bands: ['alpha'],
    settings: { carrierHz: 220, beatHz: 10, noiseType: 'none' },
  },
  {
    id: 'flow',
    name: 'Flow',
    intent: 'Focus',
    bands: ['beta'],
    settings: { carrierHz: 240, beatHz: 15, noiseType: 'white' },
  },
  {
    id: 'deep-focus',
    name: 'Deep Focus',
    intent: 'Concentration',
    bands: ['gamma', 'beta'],
    settings: { carrierHz: 260, beatHz: 40, noiseType: 'none' },
  },
];

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const bandForBeat = (beatHz: number): BrainwaveBand => {
  if (beatHz < 4) {
    return 'delta';
  }
  if (beatHz < 8) {
    return 'theta';
  }
  if (beatHz < 12) {
    return 'alpha';
  }
  if (beatHz < 30) {
    return 'beta';
  }
  return 'gamma';
};

export const clampSettings = (settings: MoongateSettings): MoongateSettings => ({
  carrierHz: clamp(settings.carrierHz, CARRIER_HZ_MIN, CARRIER_HZ_MAX),
  beatHz: clamp(settings.beatHz, BEAT_HZ_MIN, BEAT_HZ_MAX),
  toneVolume: clamp(settings.toneVolume, VOLUME_MIN, VOLUME_MAX),
  noiseType: NOISE_TYPES.includes(settings.noiseType) ? settings.noiseType : 'none',
  noiseVolume: clamp(settings.noiseVolume, VOLUME_MIN, VOLUME_MAX),
  timerMinutes: clamp(Math.round(settings.timerMinutes), TIMER_MINUTES_MIN, TIMER_MINUTES_MAX),
});

export const applyPreset = (current: MoongateSettings, preset: MoongatePreset): MoongateSettings => clampSettings({
  ...current,
  ...preset.settings,
});

export const settingsMatchPreset = (settings: MoongateSettings, preset: MoongatePreset): boolean => (
  settings.carrierHz === preset.settings.carrierHz
  && settings.beatHz === preset.settings.beatHz
  && settings.noiseType === preset.settings.noiseType
);

export const findMatchingPreset = (settings: MoongateSettings): MoongatePreset | null => (
  PRESETS.find((preset) => settingsMatchPreset(settings, preset)) ?? null
);

export const parseSettings = (value: unknown): MoongateSettings | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const numericKeys = ['carrierHz', 'beatHz', 'toneVolume', 'noiseVolume', 'timerMinutes'] as const;
  if (!numericKeys.every((key) => isFiniteNumber(candidate[key]))) {
    return null;
  }
  if (typeof candidate.noiseType !== 'string' || !NOISE_TYPES.includes(candidate.noiseType as NoiseType)) {
    return null;
  }
  return clampSettings({
    carrierHz: candidate.carrierHz as number,
    beatHz: candidate.beatHz as number,
    toneVolume: candidate.toneVolume as number,
    noiseType: candidate.noiseType as NoiseType,
    noiseVolume: candidate.noiseVolume as number,
    timerMinutes: candidate.timerMinutes as number,
  });
};

export const parseFavorites = (value: unknown): MoongateFavorite[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const favorites: MoongateFavorite[] = [];
  const seenIds = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || !candidate.id || seenIds.has(candidate.id)) {
      continue;
    }
    if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
      continue;
    }
    const settings = parseSettings(candidate.settings);
    if (!settings) {
      continue;
    }
    seenIds.add(candidate.id);
    favorites.push({ id: candidate.id, name: candidate.name.trim().slice(0, 60), settings });
  }
  return favorites;
};

export const describeSettings = (settings: MoongateSettings): string => {
  const band = BAND_INFO[bandForBeat(settings.beatHz)];
  const noise = settings.noiseType === 'none' ? 'no noise' : `${settings.noiseType} noise`;
  return `${band.label} ${settings.beatHz} Hz on ${settings.carrierHz} Hz, ${noise}`;
};

export const formatRemaining = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${minutes}:${paddedSeconds}`;
};
