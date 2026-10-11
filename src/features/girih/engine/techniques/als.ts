// Girih — ALS-XZ (almost locked set, singly linked).
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// An almost locked set is N cells in one unit holding N+1 candidates between
// them: take any one digit out and the rest lock up. Two such sets that share a
// "restricted common" digit X (every X in one sees every X in the other) can't
// both contain X, so one of them locks. If they also share Z, Z must land in
// one set or the other, and cells seeing every Z in both can't be Z.

import {
  MASK_DIGITS,
  POPCOUNT,
  UNITS,
  bit,
  cellName,
  describeCandidates,
  listDigits,
  sees,
  unitName,
  type Candidate,
  type Grid,
} from '../grid.ts';
import { dedupeByEffect, finding, type Finding, type Highlight } from '../types.ts';

const MAX_ALS_SIZE = 4;

type Als = { cells: number[]; mask: number; unit: number };

export const findAlmostLockedSets = (grid: Grid): Als[] => {
  const out: Als[] = [];
  const seen = new Set<string>();
  for (let unit = 0; unit < 27; unit += 1) {
    const empties = UNITS[unit].filter((cell) => grid.values[cell] === 0);
    const n = empties.length;
    for (let subset = 1; subset < 1 << n; subset += 1) {
      const size = POPCOUNT[subset & 0x1ff];
      if (size > MAX_ALS_SIZE || size >= n) {
        continue;
      }
      const cells: number[] = [];
      let mask = 0;
      for (let i = 0; i < n; i += 1) {
        if (subset & (1 << i)) {
          cells.push(empties[i]);
          mask |= grid.cands[empties[i]];
        }
      }
      if (POPCOUNT[mask] !== size + 1) {
        continue;
      }
      const key = cells.join(',');
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push({ cells, mask, unit });
    }
  }
  return out;
};

const describeAls = (als: Als): string =>
  `${als.cells.map(cellName).join(', ')} in ${unitName(als.unit)} (${listDigits(MASK_DIGITS[als.mask])})`;

export const alsXz = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  const sets = findAlmostLockedSets(grid);
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      const A = sets[i];
      const B = sets[j];
      const common = A.mask & B.mask;
      if (POPCOUNT[common] < 2 || A.cells.some((cell) => B.cells.includes(cell))) {
        continue;
      }
      for (const x of MASK_DIGITS[common]) {
        const xa = A.cells.filter((cell) => grid.cands[cell] & bit(x));
        const xb = B.cells.filter((cell) => grid.cands[cell] & bit(x));
        if (!xa.every((a) => xb.every((b) => sees(a, b)))) {
          continue;
        }
        for (const z of MASK_DIGITS[common & ~bit(x)]) {
          const zCells = [...A.cells, ...B.cells].filter((cell) => grid.cands[cell] & bit(z));
          const eliminations: Candidate[] = [];
          for (let cell = 0; cell < 81; cell += 1) {
            if (!(grid.cands[cell] & bit(z)) || zCells.includes(cell) || A.cells.includes(cell) || B.cells.includes(cell)) {
              continue;
            }
            if (zCells.every((zc) => sees(zc, cell))) {
              eliminations.push({ cell, digit: z });
            }
          }
          if (eliminations.length === 0) {
            continue;
          }
          const highlights: Highlight[] = [
            ...A.cells.flatMap((cell) =>
              MASK_DIGITS[grid.cands[cell]].map((digit) => ({
                cell,
                digit,
                tone: digit === z ? ('fin' as const) : digit === x ? ('on' as const) : ('base' as const),
              })),
            ),
            ...B.cells.flatMap((cell) =>
              MASK_DIGITS[grid.cands[cell]].map((digit) => ({
                cell,
                digit,
                tone: digit === z ? ('fin' as const) : digit === x ? ('on' as const) : ('alt' as const),
              })),
            ),
          ];
          out.push(
            finding({
              technique: 'als-xz',
              eliminations,
              pattern: [...A.cells, ...B.cells].sort((m, n) => m - n),
              highlights,
              units: [A.unit, B.unit],
              digit: z,
              text: `Set A is ${describeAls(A)}; set B is ${describeAls(B)}. Each holds one more digit than it has cells. Every ${x} in A sees every ${x} in B, so ${x} can be in one set at most, and the other set is then locked onto its remaining digits. Either way ${z} ends up in A or in B. A cell that sees every ${z} in both sets can't be ${z}. Remove ${describeCandidates(eliminations)}.`,
            }),
          );
        }
      }
    }
  }
  return dedupeByEffect(out.sort((a, b) => a.pattern.length - b.pattern.length)).slice(0, 40);
};
