// Girih — brute-force solver: solution lookup and uniqueness checks.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// This is the answer key, not a teacher. Drills check a player's marks against
// the solution it finds, and the miner uses it to keep generated puzzles
// unique. Depth-first search over bitmasks, always branching on the cell with
// the fewest options.

import { ALL, POPCOUNT, MASK_DIGITS, boxOf, colOf, rowOf } from './grid.ts';

const ROW = Array.from({ length: 81 }, (_, c) => rowOf(c));
const COL = Array.from({ length: 81 }, (_, c) => colOf(c));
const BOX = Array.from({ length: 81 }, (_, c) => boxOf(c));

export type SolveResult = { count: number; solution: Uint8Array | null };

/**
 * Counts solutions up to `limit`, returning the first one found. An optional
 * shuffle (a permutation of 1..9) randomises the order digits are tried in,
 * which is how random full grids are produced.
 */
export const solve = (values: Uint8Array, limit = 2, digitOrder?: number[]): SolveResult => {
  const grid = new Uint8Array(values);
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  for (let cell = 0; cell < 81; cell += 1) {
    const v = grid[cell];
    if (v === 0) {
      continue;
    }
    const b = 1 << (v - 1);
    if ((rows[ROW[cell]] | cols[COL[cell]] | boxes[BOX[cell]]) & b) {
      return { count: 0, solution: null };
    }
    rows[ROW[cell]] |= b;
    cols[COL[cell]] |= b;
    boxes[BOX[cell]] |= b;
  }

  let count = 0;
  let solution: Uint8Array | null = null;

  const search = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let cell = 0; cell < 81; cell += 1) {
      if (grid[cell] !== 0) {
        continue;
      }
      const mask = ALL & ~(rows[ROW[cell]] | cols[COL[cell]] | boxes[BOX[cell]]);
      const n = POPCOUNT[mask];
      if (n < bestCount) {
        best = cell;
        bestMask = mask;
        bestCount = n;
        if (n <= 1) {
          break;
        }
      }
    }
    if (best === -1) {
      count += 1;
      if (solution === null) {
        solution = new Uint8Array(grid);
      }
      return count >= limit;
    }
    if (bestCount === 0) {
      return false;
    }
    const r = ROW[best];
    const c = COL[best];
    const x = BOX[best];
    const digits = digitOrder ? digitOrder.filter((d) => bestMask & (1 << (d - 1))) : MASK_DIGITS[bestMask];
    for (const d of digits) {
      const b = 1 << (d - 1);
      grid[best] = d;
      rows[r] |= b;
      cols[c] |= b;
      boxes[x] |= b;
      const done = search();
      rows[r] &= ~b;
      cols[c] &= ~b;
      boxes[x] &= ~b;
      grid[best] = 0;
      if (done) {
        return true;
      }
    }
    return false;
  };

  search();
  return { count, solution };
};

export const hasUniqueSolution = (values: Uint8Array): boolean => solve(values, 2).count === 1;

export const solutionOf = (values: Uint8Array): Uint8Array | null => {
  const result = solve(values, 2);
  return result.count === 1 ? result.solution : null;
};
