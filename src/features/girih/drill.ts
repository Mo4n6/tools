// Girih — drawing drills from the bank and judging a player's answer.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import { applyTransform, decodePosition, randomTransform } from './engine/bank';
import { TECHNIQUES, techniqueById } from './engine/catalog';
import { candidateKey, joinWords, unitName, type Candidate, type Grid } from './engine/grid';
import { pick, type Rng } from './engine/random';
import { solutionOf } from './engine/solver';
import type { Finding, TechniqueId } from './engine/types';

export type Bank = Record<TechniqueId, string[]>;

export type Drill = {
  technique: TechniqueId;
  /** Index of the stored position, so recent ones can be skipped. */
  index: number;
  grid: Grid;
  solution: Uint8Array;
  findings: Finding[];
};

export type Answer = { placements: Candidate[]; eliminations: Candidate[] };

export type Verdict =
  | { kind: 'empty' }
  | { kind: 'wrong'; falsePlacements: Candidate[]; falseEliminations: Candidate[] }
  | { kind: 'correct'; finding: Finding; missing: Candidate[]; technique: TechniqueId }
  | { kind: 'other'; technique: TechniqueId | null };

/** How many recent positions to avoid repeating, given how many exist. */
export const recentWindow = (available: number): number => Math.min(24, Math.floor(available / 2));

export const createDrill = (bank: Bank, technique: TechniqueId, rng: Rng, recent: number[]): Drill => {
  const codes = bank[technique] ?? [];
  if (codes.length === 0) {
    throw new Error(`no positions for ${technique}`);
  }
  const avoid = new Set(recent.slice(-recentWindow(codes.length)));
  const fresh = codes.map((_, i) => i).filter((i) => !avoid.has(i));
  const index = pick(rng, fresh.length > 0 ? fresh : codes.map((_, i) => i));
  const grid = applyTransform(decodePosition(codes[index]), randomTransform(rng));
  const solution = solutionOf(grid.values);
  if (!solution) {
    throw new Error(`position ${technique}#${index} is not uniquely solvable`);
  }
  return { technique, index, grid, solution, findings: techniqueById(technique).detect(grid) };
};

const effects = (item: Finding): Set<string> =>
  new Set([
    ...item.placements.map((c) => `p${candidateKey(c)}`),
    ...item.eliminations.map((c) => `e${candidateKey(c)}`),
  ]);

const answerKeys = (answer: Answer): string[] => [
  ...answer.placements.map((c) => `p${candidateKey(c)}`),
  ...answer.eliminations.map((c) => `e${candidateKey(c)}`),
];

/** The finding that explains every mark, preferring one the marks cover completely. */
const bestMatch = (findings: Finding[], keys: string[]): Finding | null => {
  let best: Finding | null = null;
  let bestScore = -1;
  for (const item of findings) {
    const fx = effects(item);
    if (!keys.every((k) => fx.has(k))) {
      continue;
    }
    // Prefer the tightest fit: all marks explained, fewest left unmarked.
    const score = 1000 - (fx.size - keys.length);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
};

const missingFrom = (item: Finding, answer: Answer): Candidate[] => {
  const have = new Set(answerKeys(answer));
  return [
    ...item.placements.filter((c) => !have.has(`p${candidateKey(c)}`)),
    ...item.eliminations.filter((c) => !have.has(`e${candidateKey(c)}`)),
  ];
};

/**
 * Judges marks against the drill. Right means every mark is true and every
 * mark follows from the drill's technique; marks can stop short of the full
 * set of eliminations, and the verdict lists what was left.
 */
export const judge = (
  drill: Drill,
  answer: Answer,
  options: { restrictTo?: Finding[]; acceptSameTier?: boolean } = {},
): Verdict => {
  const { restrictTo, acceptSameTier = false } = options;
  const keys = answerKeys(answer);
  if (keys.length === 0) {
    return { kind: 'empty' };
  }
  const falsePlacements = answer.placements.filter(({ cell, digit }) => drill.solution[cell] !== digit);
  const falseEliminations = answer.eliminations.filter(({ cell, digit }) => drill.solution[cell] === digit);
  if (falsePlacements.length > 0 || falseEliminations.length > 0) {
    return { kind: 'wrong', falsePlacements, falseEliminations };
  }
  const pool = restrictTo && restrictTo.length > 0 ? restrictTo : drill.findings;
  const match = bestMatch(pool, keys) ?? (pool !== drill.findings ? bestMatch(drill.findings, keys) : null);
  if (match) {
    return { kind: 'correct', finding: match, missing: missingFrom(match, answer), technique: drill.technique };
  }
  // Marks taken from two instances of the technique at once are still right.
  const union = new Set(drill.findings.flatMap((item) => [...effects(item)]));
  if (keys.every((k) => union.has(k))) {
    const widest = [...drill.findings].sort(
      (a, b) => keys.filter((k) => effects(b).has(k)).length - keys.filter((k) => effects(a).has(k)).length,
    )[0];
    return { kind: 'correct', finding: widest, missing: missingFrom(widest, answer), technique: drill.technique };
  }
  // True, but not this technique. Say which technique it is, if any. Within a
  // tier the order is a teaching order, not a difficulty ranking, so when the
  // caller allows it a same-tier technique counts.
  const tier = techniqueById(drill.technique).tier;
  for (const tech of TECHNIQUES) {
    if (tech.id === drill.technique) {
      continue;
    }
    const other = bestMatch(tech.detect(drill.grid), keys);
    if (other) {
      if (acceptSameTier && tech.tier === tier) {
        return { kind: 'correct', finding: other, missing: missingFrom(other, answer), technique: tech.id };
      }
      return { kind: 'other', technique: tech.id };
    }
  }
  return { kind: 'other', technique: null };
};

/** Findings whose pattern is exactly the selected cells. */
export const matchPattern = (drill: Drill, cells: number[]): Finding[] => {
  const wanted = [...cells].sort((a, b) => a - b).join(',');
  return drill.findings.filter((item) => [...item.pattern].sort((a, b) => a - b).join(',') === wanted);
};

/** The first hint: where to look, without giving the pattern away. */
export const whereToLook = (item: Finding): string => {
  const parts: string[] = [];
  if (item.units.length > 0) {
    parts.push(`Look at ${joinWords(item.units.map(unitName))}.`);
  }
  if (item.digit !== undefined) {
    parts.push(`Focus on the ${item.digit}s.`);
  }
  if (parts.length === 0) {
    parts.push('Start from the outlined cells.');
  }
  return parts.join(' ');
};
