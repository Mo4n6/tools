import { describe, expect, it } from 'vitest';
import {
  BEAT_HZ_MAX,
  CARRIER_HZ_MIN,
  DEFAULT_SETTINGS,
  PRESETS,
  applyPreset,
  bandForBeat,
  clampSettings,
  findMatchingPreset,
  formatRemaining,
  parseFavorites,
  parseSettings,
} from './presets';

describe('bandForBeat', () => {
  it('maps beat frequencies to brainwave bands', () => {
    expect(bandForBeat(0.5)).toBe('delta');
    expect(bandForBeat(3.9)).toBe('delta');
    expect(bandForBeat(4)).toBe('theta');
    expect(bandForBeat(8)).toBe('alpha');
    expect(bandForBeat(12)).toBe('beta');
    expect(bandForBeat(29.5)).toBe('beta');
    expect(bandForBeat(30)).toBe('gamma');
    expect(bandForBeat(40)).toBe('gamma');
  });
});

describe('clampSettings', () => {
  it('clamps every numeric field into its supported range', () => {
    const clamped = clampSettings({
      carrierHz: -10,
      beatHz: 999,
      toneVolume: 4,
      noiseType: 'pink',
      noiseVolume: -1,
      timerMinutes: 12.6,
    });
    expect(clamped.carrierHz).toBe(CARRIER_HZ_MIN);
    expect(clamped.beatHz).toBe(BEAT_HZ_MAX);
    expect(clamped.toneVolume).toBe(1);
    expect(clamped.noiseVolume).toBe(0);
    expect(clamped.timerMinutes).toBe(13);
  });

  it('falls back to no noise for unknown noise types', () => {
    const clamped = clampSettings({ ...DEFAULT_SETTINGS, noiseType: 'purple' as never });
    expect(clamped.noiseType).toBe('none');
  });
});

describe('presets', () => {
  it('have unique ids and in-range settings', () => {
    const ids = new Set(PRESETS.map((preset) => preset.id));
    expect(ids.size).toBe(PRESETS.length);
    for (const preset of PRESETS) {
      const applied = applyPreset(DEFAULT_SETTINGS, preset);
      expect(applied.carrierHz).toBe(preset.settings.carrierHz);
      expect(applied.beatHz).toBe(preset.settings.beatHz);
      expect(applied.noiseType).toBe(preset.settings.noiseType);
      expect(preset.bands).toContain(bandForBeat(preset.settings.beatHz));
    }
  });

  it('keeps volumes and timer when applying a preset', () => {
    const current = { ...DEFAULT_SETTINGS, toneVolume: 0.2, noiseVolume: 0.9, timerMinutes: 45 };
    const applied = applyPreset(current, PRESETS[0]!);
    expect(applied.toneVolume).toBe(0.2);
    expect(applied.noiseVolume).toBe(0.9);
    expect(applied.timerMinutes).toBe(45);
  });

  it('detects the matching preset and returns null for custom mixes', () => {
    const applied = applyPreset(DEFAULT_SETTINGS, PRESETS[2]!);
    expect(findMatchingPreset(applied)?.id).toBe(PRESETS[2]!.id);
    expect(findMatchingPreset({ ...applied, beatHz: applied.beatHz + 0.5 })).toBeNull();
  });
});

describe('parseSettings', () => {
  it('round-trips valid settings', () => {
    expect(parseSettings(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects malformed input', () => {
    expect(parseSettings(null)).toBeNull();
    expect(parseSettings('nope')).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, beatHz: 'six' })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, beatHz: Number.NaN })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, noiseType: 'purple' })).toBeNull();
  });
});

describe('parseFavorites', () => {
  it('drops invalid entries, duplicate ids, and trims names', () => {
    const favorites = parseFavorites([
      { id: 'a', name: '  Night  ', settings: DEFAULT_SETTINGS },
      { id: 'a', name: 'Dup', settings: DEFAULT_SETTINGS },
      { id: 'b', name: '', settings: DEFAULT_SETTINGS },
      { id: 'c', name: 'Broken', settings: { beatHz: 1 } },
      'garbage',
    ]);
    expect(favorites).toEqual([{ id: 'a', name: 'Night', settings: DEFAULT_SETTINGS }]);
  });

  it('returns an empty list for non-arrays', () => {
    expect(parseFavorites({})).toEqual([]);
    expect(parseFavorites(undefined)).toEqual([]);
  });
});

describe('formatRemaining', () => {
  it('formats minutes and seconds, adding hours when needed', () => {
    expect(formatRemaining(0)).toBe('0:00');
    expect(formatRemaining(59_000)).toBe('0:59');
    expect(formatRemaining(61_000)).toBe('1:01');
    expect(formatRemaining(90 * 60 * 1000)).toBe('1:30:00');
    expect(formatRemaining(-500)).toBe('0:00');
  });
});
