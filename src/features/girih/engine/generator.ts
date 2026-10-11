// Girih — random minimal puzzles, for the offline position miner only.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// The app never generates puzzles: it draws from the mined bank and disguises
// each position with a symmetry transform. This is the miner's raw material.

import { cellAt } from './grid.ts';
import { shuffle, type Rng } from './random.ts';
import { hasUniqueSolution, solve } from './solver.ts';

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const randomSolution = (rng: Rng): Uint8Array => {
  const values = new Uint8Array(81);
  // The three diagonal boxes never constrain each other, so fill them freely.
  for (let box = 0; box < 3; box += 1) {
    const digits = shuffle(rng, DIGITS);
    for (let i = 0; i < 9; i += 1) {
      values[cellAt(box * 3 + Math.floor(i / 3), box * 3 + (i % 3))] = digits[i];
    }
  }
  const result = solve(values, 1, shuffle(rng, DIGITS));
  if (!result.solution) {
    throw new Error('diagonal boxes always complete');
  }
  return result.solution;
};

/** Removes clues in random order while the solution stays unique. */
export const randomPuzzle = (rng: Rng): { puzzle: Uint8Array; solution: Uint8Array } => {
  const solution = randomSolution(rng);
  const puzzle = new Uint8Array(solution);
  for (const cell of shuffle(
    rng,
    Array.from({ length: 81 }, (_, i) => i),
  )) {
    const kept = puzzle[cell];
    puzzle[cell] = 0;
    if (!hasUniqueSolution(puzzle)) {
      puzzle[cell] = kept;
    }
  }
  return { puzzle, solution };
};
