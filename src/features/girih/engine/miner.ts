// Girih — finds drill positions by solving random puzzles the human way.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Each puzzle is solved one simplest move at a time. Whenever a technique is
// the simplest move available, the board at that moment is a candidate drill
// for it. Every move is checked against the known solution as it is applied, so
// a detector that ever eliminates a true candidate stops the run.

import { TECHNIQUES, techniqueById } from './catalog.ts';
import { encodePosition } from './bank.ts';
import { cellName, emptyCount, gridFromValues, type Grid } from './grid.ts';
import { randomPuzzle } from './generator.ts';
import type { Rng } from './random.ts';
import { applyFinding, isSolved, simplestStep } from './stepper.ts';
import type { Finding, TechniqueId } from './types.ts';

export type MineStats = {
  puzzles: number;
  solved: number;
  /** How many puzzles each technique was the hardest needed for. */
  hardest: Partial<Record<TechniqueId | 'unsolved', number>>;
};

export type MineResult = { buckets: Partial<Record<TechniqueId, string[]>>; stats: MineStats };

/** Singles drills hide candidates, so they need boards where nothing has been eliminated yet. */
const SINGLES_RULES: Partial<Record<TechniqueId, { minEmpty: number; maxFindings: number }>> = {
  'full-house': { minEmpty: 25, maxFindings: 3 },
  'hidden-single': { minEmpty: 35, maxFindings: 4 },
  'naked-single': { minEmpty: 20, maxFindings: 3 },
};

export const assertSound = (grid: Grid, solution: Uint8Array, item: Finding): void => {
  for (const { cell, digit } of item.placements) {
    if (solution[cell] !== digit) {
      throw new Error(`${item.technique} placed ${digit} in ${cellName(cell)}, solution is ${solution[cell]}`);
    }
  }
  for (const { cell, digit } of item.eliminations) {
    if (solution[cell] === digit) {
      throw new Error(`${item.technique} eliminated the true ${digit} from ${cellName(cell)}`);
    }
    if (!(grid.cands[cell] & (1 << (digit - 1)))) {
      throw new Error(`${item.technique} eliminated ${digit} from ${cellName(cell)}, which was not a candidate`);
    }
  }
};

export const mine = (rng: Rng, options: { deadline: number; cap: number; now: () => number }): MineResult => {
  const buckets: Partial<Record<TechniqueId, string[]>> = {};
  const stats: MineStats = { puzzles: 0, solved: 0, hardest: {} };
  const full = (id: TechniqueId): boolean => (buckets[id]?.length ?? 0) >= options.cap;

  while (options.now() < options.deadline) {
    const { puzzle, solution } = randomPuzzle(rng);
    const grid = gridFromValues(puzzle);
    stats.puzzles += 1;
    let pure = true;
    let hardest = -1;
    const takenThisPuzzle = new Set<TechniqueId>();

    for (let guard = 0; guard < 400; guard += 1) {
      const step = simplestStep(grid);
      if (!step) {
        break;
      }
      const technique = techniqueById(step.technique);
      hardest = Math.max(hardest, TECHNIQUES.indexOf(technique));
      for (const item of step.findings) {
        assertSound(grid, solution, item);
      }

      if (!full(step.technique) && !takenThisPuzzle.has(step.technique)) {
        const rule = SINGLES_RULES[step.technique];
        const ok = rule
          ? pure && emptyCount(grid) >= rule.minEmpty && step.findings.length <= rule.maxFindings && rng() < 0.35
          : technique.tier > 1;
        if (ok) {
          (buckets[step.technique] ??= []).push(encodePosition(grid));
          takenThisPuzzle.add(step.technique);
        }
      }

      if (technique.places) {
        // Every single found is true, so they can all go in at once.
        for (const item of step.findings) {
          if (item.placements.every(({ cell }) => grid.values[cell] === 0)) {
            applyFinding(grid, item);
          }
        }
      } else {
        pure = false;
        applyFinding(grid, step.findings[Math.floor(rng() * step.findings.length)]);
      }
    }

    if (isSolved(grid)) {
      stats.solved += 1;
      const id = TECHNIQUES[hardest]?.id;
      if (id) {
        stats.hardest[id] = (stats.hardest[id] ?? 0) + 1;
      }
    } else {
      stats.hardest.unsolved = (stats.hardest.unsolved ?? 0) + 1;
    }
  }
  return { buckets, stats };
};
