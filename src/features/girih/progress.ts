// Girih — what the player has learned, kept in this browser only.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import { TECHNIQUES, TIERS, techniqueById, techniquesInTier } from './engine/catalog';
import type { TechniqueId } from './engine/types';

export const STORAGE_KEY = 'girih.progress.v1';

/** Mastery: this many clean drills out of the last MASTERY_WINDOW. */
export const MASTERY_WINDOW = 6;
export const MASTERY_NEEDED = 5;
export const TEST_LENGTH = 10;
export const TEST_PASS = 8;

export type TechniqueRecord = {
  /** Clean results (right first time, no hints), newest last. */
  results: boolean[];
  attempts: number;
  clean: number;
  sawLesson: boolean;
  /** Sticky: a bad run later doesn't relock what this unlocked. */
  mastered: boolean;
};

export type Progress = {
  version: 1;
  techniques: Partial<Record<TechniqueId, TechniqueRecord>>;
  tests: Partial<Record<number, { best: number; passed: boolean }>>;
  recent: Partial<Record<TechniqueId, number[]>>;
  unlockAll: boolean;
};

export const emptyProgress = (): Progress => ({ version: 1, techniques: {}, tests: {}, recent: {}, unlockAll: false });

const record = (progress: Progress, id: TechniqueId): TechniqueRecord =>
  progress.techniques[id] ?? { results: [], attempts: 0, clean: 0, sawLesson: false, mastered: false };

export const masteryCount = (progress: Progress, id: TechniqueId): number =>
  record(progress, id)
    .results.slice(-MASTERY_WINDOW)
    .filter(Boolean).length;

export const isMastered = (progress: Progress, id: TechniqueId): boolean =>
  record(progress, id).mastered || masteryCount(progress, id) >= MASTERY_NEEDED;

export const isTestPassed = (progress: Progress, tier: number): boolean => progress.tests[tier]?.passed === true;

export const isUnlocked = (progress: Progress, id: TechniqueId): boolean => {
  if (progress.unlockAll) {
    return true;
  }
  const tech = techniqueById(id);
  const inTier = techniquesInTier(tech.tier);
  const position = inTier.findIndex((t) => t.id === id);
  if (position > 0) {
    return isMastered(progress, inTier[position - 1].id);
  }
  return tech.tier === 1 || isTestPassed(progress, tech.tier - 1);
};

export const isTestUnlocked = (progress: Progress, tier: number): boolean =>
  progress.unlockAll || techniquesInTier(tier).every((t) => isMastered(progress, t.id));

/** The technique a returning player should land on. */
export const nextTechnique = (progress: Progress): TechniqueId => {
  for (const tech of TECHNIQUES) {
    if (isUnlocked(progress, tech.id) && !isMastered(progress, tech.id)) {
      return tech.id;
    }
  }
  return TECHNIQUES[TECHNIQUES.length - 1].id;
};

/** Techniques fair game for mixed review: everything mastered, or everything if unlocked. */
export const reviewPool = (progress: Progress, upToTier = TIERS.length): TechniqueId[] =>
  TECHNIQUES.filter(
    (t) => t.tier <= upToTier && (progress.unlockAll ? true : isMastered(progress, t.id)),
  ).map((t) => t.id);

export const withResult = (progress: Progress, id: TechniqueId, clean: boolean): Progress => {
  const current = record(progress, id);
  const results = [...current.results, clean].slice(-20);
  return {
    ...progress,
    techniques: {
      ...progress.techniques,
      [id]: {
        ...current,
        results,
        attempts: current.attempts + 1,
        clean: current.clean + (clean ? 1 : 0),
        mastered: current.mastered || results.slice(-MASTERY_WINDOW).filter(Boolean).length >= MASTERY_NEEDED,
      },
    },
  };
};

export const withLessonSeen = (progress: Progress, id: TechniqueId): Progress => {
  const current = record(progress, id);
  if (current.sawLesson) {
    return progress;
  }
  return { ...progress, techniques: { ...progress.techniques, [id]: { ...current, sawLesson: true } } };
};

export const withRecent = (progress: Progress, id: TechniqueId, index: number): Progress => ({
  ...progress,
  recent: { ...progress.recent, [id]: [...(progress.recent[id] ?? []), index].slice(-30) },
});

export const withTest = (progress: Progress, tier: number, score: number): Progress => {
  const previous = progress.tests[tier];
  return {
    ...progress,
    tests: {
      ...progress.tests,
      [tier]: {
        best: Math.max(previous?.best ?? 0, score),
        passed: (previous?.passed ?? false) || score >= TEST_PASS,
      },
    },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Accepts whatever storage held and keeps only what still makes sense. */
export const parseProgress = (raw: unknown): Progress => {
  const progress = emptyProgress();
  if (!isRecord(raw) || raw.version !== 1) {
    return progress;
  }
  const known = new Set<string>(TECHNIQUES.map((t) => t.id));
  if (isRecord(raw.techniques)) {
    for (const [id, value] of Object.entries(raw.techniques)) {
      if (!known.has(id) || !isRecord(value) || !Array.isArray(value.results)) {
        continue;
      }
      progress.techniques[id as TechniqueId] = {
        results: value.results.filter((r): r is boolean => typeof r === 'boolean').slice(-20),
        attempts: typeof value.attempts === 'number' ? value.attempts : 0,
        clean: typeof value.clean === 'number' ? value.clean : 0,
        sawLesson: value.sawLesson === true,
        mastered: value.mastered === true,
      };
    }
  }
  if (isRecord(raw.tests)) {
    for (const [tier, value] of Object.entries(raw.tests)) {
      const n = Number(tier);
      if (Number.isInteger(n) && n >= 1 && n <= TIERS.length && isRecord(value) && typeof value.best === 'number') {
        progress.tests[n] = { best: value.best, passed: value.passed === true };
      }
    }
  }
  if (isRecord(raw.recent)) {
    for (const [id, value] of Object.entries(raw.recent)) {
      if (known.has(id) && Array.isArray(value)) {
        progress.recent[id as TechniqueId] = value.filter((v): v is number => Number.isInteger(v)).slice(-30);
      }
    }
  }
  progress.unlockAll = raw.unlockAll === true;
  return progress;
};

export const loadProgress = (): Progress => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseProgress(JSON.parse(raw)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
};

export const saveProgress = (progress: Progress): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage may be unavailable (private mode, quota); progress just won't persist.
  }
};
