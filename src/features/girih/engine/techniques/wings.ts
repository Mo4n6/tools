// Girih — XY-Wing, XYZ-Wing and W-Wing.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import {
  MASK_DIGITS,
  POPCOUNT,
  bit,
  cellName,
  commonPeers,
  describeCandidates,
  positionsIn,
  sees,
  unitName,
  type Candidate,
  type Grid,
} from '../grid.ts';
import { dedupe, finding, type Finding } from '../types.ts';

const pairText = (grid: Grid, cell: number): string => `${cellName(cell)} (${MASK_DIGITS[grid.cands[cell]].join('/')})`;

const cellsWithCount = (grid: Grid, count: number): number[] => {
  const out: number[] = [];
  for (let cell = 0; cell < 81; cell += 1) {
    if (grid.values[cell] === 0 && POPCOUNT[grid.cands[cell]] === count) {
      out.push(cell);
    }
  }
  return out;
};

const eliminateFrom = (grid: Grid, cells: number[], digit: number): Candidate[] =>
  commonPeers(cells)
    .filter((cell) => grid.cands[cell] & bit(digit))
    .map((cell) => ({ cell, digit }));

export const xyWing = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  const bivalues = cellsWithCount(grid, 2);
  for (const pivot of bivalues) {
    const pm = grid.cands[pivot];
    const [x, y] = MASK_DIGITS[pm];
    const wings = bivalues.filter((cell) => cell !== pivot && sees(cell, pivot) && POPCOUNT[grid.cands[cell] & pm] === 1);
    for (const a of wings) {
      if (!(grid.cands[a] & bit(x))) {
        continue;
      }
      const z = MASK_DIGITS[grid.cands[a] & ~bit(x)][0];
      for (const b of wings) {
        if (b === a || grid.cands[b] !== (bit(y) | bit(z))) {
          continue;
        }
        const eliminations = eliminateFrom(grid, [a, b], z);
        if (eliminations.length === 0) {
          continue;
        }
        out.push(
          finding({
            technique: 'xy-wing',
            eliminations,
            pattern: [pivot, a, b].sort((m, n) => m - n),
            highlights: [
              { cell: pivot, digit: x, tone: 'base' },
              { cell: pivot, digit: y, tone: 'base' },
              { cell: a, digit: x, tone: 'base' },
              { cell: b, digit: y, tone: 'base' },
              { cell: a, digit: z, tone: 'fin' },
              { cell: b, digit: z, tone: 'fin' },
            ],
            digit: z,
            text: `The pivot ${pairText(grid, pivot)} sees two wings, ${pairText(grid, a)} and ${pairText(grid, b)}. If the pivot is ${x}, ${cellName(a)} becomes ${z}. If it is ${y}, ${cellName(b)} becomes ${z}. Either way one wing is ${z}, so any cell that sees both wings can't be ${z}. Remove ${describeCandidates(eliminations)}.`,
          }),
        );
      }
    }
  }
  return dedupe(out);
};

export const xyzWing = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  const bivalues = cellsWithCount(grid, 2);
  for (const pivot of cellsWithCount(grid, 3)) {
    const pm = grid.cands[pivot];
    const wings = bivalues.filter((cell) => sees(cell, pivot) && (grid.cands[cell] & ~pm) === 0);
    for (let i = 0; i < wings.length; i += 1) {
      for (let j = i + 1; j < wings.length; j += 1) {
        const a = wings[i];
        const b = wings[j];
        const ma = grid.cands[a];
        const mb = grid.cands[b];
        if (ma === mb || (ma | mb) !== pm) {
          continue;
        }
        const z = MASK_DIGITS[ma & mb][0];
        const eliminations = eliminateFrom(grid, [pivot, a, b], z);
        if (eliminations.length === 0) {
          continue;
        }
        out.push(
          finding({
            technique: 'xyz-wing',
            eliminations,
            pattern: [pivot, a, b].sort((m, n) => m - n),
            highlights: [
              ...MASK_DIGITS[pm].map((digit) => ({ cell: pivot, digit, tone: (digit === z ? 'fin' : 'base') as 'fin' | 'base' })),
              ...MASK_DIGITS[ma].map((digit) => ({ cell: a, digit, tone: (digit === z ? 'fin' : 'base') as 'fin' | 'base' })),
              ...MASK_DIGITS[mb].map((digit) => ({ cell: b, digit, tone: (digit === z ? 'fin' : 'base') as 'fin' | 'base' })),
            ],
            digit: z,
            text: `The pivot ${pairText(grid, pivot)} sees two wings, ${pairText(grid, a)} and ${pairText(grid, b)}. Whatever the pivot turns out to be, one of the three cells ends up as ${z}: the pivot itself, or a wing forced to ${z}. So a cell that sees all three can't be ${z}. Remove ${describeCandidates(eliminations)}.`,
          }),
        );
      }
    }
  }
  return dedupe(out);
};

export const wWing = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  const bivalues = cellsWithCount(grid, 2);
  for (let i = 0; i < bivalues.length; i += 1) {
    for (let j = i + 1; j < bivalues.length; j += 1) {
      const a = bivalues[i];
      const b = bivalues[j];
      if (grid.cands[a] !== grid.cands[b] || sees(a, b)) {
        continue;
      }
      const digits = MASK_DIGITS[grid.cands[a]];
      for (const linkDigit of digits) {
        const other = digits.find((d) => d !== linkDigit) as number;
        const eliminations = eliminateFrom(grid, [a, b], other);
        if (eliminations.length === 0) {
          continue;
        }
        for (let unit = 0; unit < 27; unit += 1) {
          const ends = positionsIn(grid, unit, linkDigit);
          if (ends.length !== 2 || ends.includes(a) || ends.includes(b)) {
            continue;
          }
          for (const [e1, e2] of [ends, [ends[1], ends[0]]]) {
            if (!sees(e1, a) || !sees(e2, b)) {
              continue;
            }
            out.push(
              finding({
                technique: 'w-wing',
                eliminations,
                pattern: [a, b, e1, e2].sort((m, n) => m - n),
                highlights: [
                  { cell: a, digit: linkDigit, tone: 'off' },
                  { cell: b, digit: linkDigit, tone: 'off' },
                  { cell: a, digit: other, tone: 'base' },
                  { cell: b, digit: other, tone: 'base' },
                  { cell: e1, digit: linkDigit, tone: 'on' },
                  { cell: e2, digit: linkDigit, tone: 'on' },
                ],
                units: [unit],
                links: [
                  { from: { cell: a, digit: linkDigit }, to: { cell: e1, digit: linkDigit }, strong: false },
                  { from: { cell: e1, digit: linkDigit }, to: { cell: e2, digit: linkDigit }, strong: true },
                  { from: { cell: e2, digit: linkDigit }, to: { cell: b, digit: linkDigit }, strong: false },
                ],
                digit: other,
                text: `${pairText(grid, a)} and ${pairText(grid, b)} hold the same pair. In ${unitName(unit)}, ${linkDigit} can only go in ${cellName(e1)} or ${cellName(e2)}, and each bivalue cell sees one of them. Whichever one is ${linkDigit} stops the cell it sees from being ${linkDigit}, forcing it to ${other}. So at least one of the pair is ${other}, and any cell that sees both can't be. Remove ${describeCandidates(eliminations)}.`,
              }),
            );
          }
        }
      }
    }
  }
  return dedupe(out);
};

