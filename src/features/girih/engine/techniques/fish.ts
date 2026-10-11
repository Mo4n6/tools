// Girih — basic fish (X-Wing, Swordfish, Jellyfish) and finned fish.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// A fish of size n on one digit: n base lines (rows, say) whose candidates all
// fall within n cover lines (columns). The n base lines need n of the digit,
// and the cover lines can only supply them from those intersections, so the
// cover lines can hold the digit nowhere else.

import {
  MASK_DIGITS,
  POPCOUNT,
  bit,
  boxOf,
  cellAt,
  combinations,
  describeCandidates,
  joinWords,
  listCells,
  type Candidate,
  type Grid,
} from '../grid.ts';
import { dedupe, finding, type Finding, type Highlight, type TechniqueId } from '../types.ts';

type Orientation = 'rows' | 'columns';

const cellOf = (orientation: Orientation, line: number, cross: number): number =>
  orientation === 'rows' ? cellAt(line, cross) : cellAt(cross, line);

const lineUnit = (orientation: Orientation, line: number): number => (orientation === 'rows' ? line : 9 + line);
const crossUnit = (orientation: Orientation, cross: number): number => (orientation === 'rows' ? 9 + cross : cross);

const lineWord = (orientation: Orientation, plural: boolean): string => {
  if (orientation === 'rows') {
    return plural ? 'rows' : 'row';
  }
  return plural ? 'columns' : 'column';
};

const otherWord = (orientation: Orientation, plural: boolean): string =>
  lineWord(orientation === 'rows' ? 'columns' : 'rows', plural);

const numbers = (indices: number[]): string => joinWords(indices.map((i) => String(i + 1)));

/** Bitmask of cross positions (columns, for row lines) holding the digit. */
const lineMask = (grid: Grid, orientation: Orientation, line: number, digit: number): number => {
  let mask = 0;
  const b = bit(digit);
  for (let cross = 0; cross < 9; cross += 1) {
    if (grid.cands[cellOf(orientation, line, cross)] & b) {
      mask |= 1 << cross;
    }
  }
  return mask;
};

const NAMES: Record<number, string> = { 2: 'X-Wing', 3: 'Swordfish', 4: 'Jellyfish' };

const basicFish = (size: number, technique: TechniqueId) => (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (let digit = 1; digit <= 9; digit += 1) {
    for (const orientation of ['rows', 'columns'] as Orientation[]) {
      const lines: number[] = [];
      const masks: number[] = [];
      for (let line = 0; line < 9; line += 1) {
        const mask = lineMask(grid, orientation, line, digit);
        const n = POPCOUNT[mask];
        if (n >= 2 && n <= size) {
          lines.push(line);
          masks[line] = mask;
        }
      }
      for (const base of combinations(lines, size)) {
        let cover = 0;
        for (const line of base) {
          cover |= masks[line];
        }
        if (POPCOUNT[cover] !== size) {
          continue;
        }
        const covers = MASK_DIGITS[cover].map((d) => d - 1);
        const eliminations: Candidate[] = [];
        for (const cross of covers) {
          for (let line = 0; line < 9; line += 1) {
            if (base.includes(line)) {
              continue;
            }
            const cell = cellOf(orientation, line, cross);
            if (grid.cands[cell] & bit(digit)) {
              eliminations.push({ cell, digit });
            }
          }
        }
        if (eliminations.length === 0) {
          continue;
        }
        const pattern: number[] = [];
        for (const line of base) {
          for (const cross of covers) {
            const cell = cellOf(orientation, line, cross);
            if (grid.cands[cell] & bit(digit)) {
              pattern.push(cell);
            }
          }
        }
        out.push(
          finding({
            technique,
            eliminations: eliminations.sort((a, b) => a.cell - b.cell),
            pattern: pattern.sort((a, b) => a - b),
            highlights: pattern.map((cell) => ({ cell, digit, tone: 'base' })),
            units: [...base.map((l) => lineUnit(orientation, l)), ...covers.map((c) => crossUnit(orientation, c))],
            digit,
            text: `${NAMES[size]} on ${digit}: in ${lineWord(orientation, true)} ${numbers(base)}, every ${digit} sits in ${otherWord(orientation, true)} ${numbers(covers)}. Each of those ${lineWord(orientation, true)} must put its ${digit} in one of these ${otherWord(orientation, true)}, never two in the same one, so between them they take the ${digit} of every one of these ${otherWord(orientation, true)}. No other cell in them can be ${digit}. Remove ${describeCandidates(eliminations)}.`,
          }),
        );
      }
    }
  }
  return dedupe(out);
};

const finnedFish = (size: number, technique: TechniqueId) => (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (let digit = 1; digit <= 9; digit += 1) {
    const b = bit(digit);
    for (const orientation of ['rows', 'columns'] as Orientation[]) {
      const lines: number[] = [];
      const masks: number[] = [];
      for (let line = 0; line < 9; line += 1) {
        const mask = lineMask(grid, orientation, line, digit);
        const n = POPCOUNT[mask];
        if (n >= 2 && n <= size + 3) {
          lines.push(line);
          masks[line] = mask;
        }
      }
      for (const base of combinations(lines, size)) {
        let union = 0;
        for (const line of base) {
          union |= masks[line];
        }
        if (POPCOUNT[union] <= size) {
          continue;
        }
        const crosses = MASK_DIGITS[union].map((d) => d - 1);
        for (const covers of combinations(crosses, size)) {
          const coverMask = covers.reduce((m, c) => m | (1 << c), 0);
          if (!base.every((line) => masks[line] & coverMask)) {
            continue;
          }
          const fins: number[] = [];
          for (const line of base) {
            for (const cross of MASK_DIGITS[masks[line] & ~coverMask].map((d) => d - 1)) {
              fins.push(cellOf(orientation, line, cross));
            }
          }
          if (fins.length === 0) {
            continue;
          }
          const finBox = boxOf(fins[0]);
          if (!fins.every((cell) => boxOf(cell) === finBox)) {
            continue;
          }
          const eliminations: Candidate[] = [];
          for (const cross of covers) {
            for (let line = 0; line < 9; line += 1) {
              if (base.includes(line)) {
                continue;
              }
              const cell = cellOf(orientation, line, cross);
              if (grid.cands[cell] & b && boxOf(cell) === finBox) {
                eliminations.push({ cell, digit });
              }
            }
          }
          if (eliminations.length === 0) {
            continue;
          }
          const body: number[] = [];
          for (const line of base) {
            for (const cross of covers) {
              const cell = cellOf(orientation, line, cross);
              if (grid.cands[cell] & b) {
                body.push(cell);
              }
            }
          }
          const highlights: Highlight[] = [
            ...body.map((cell) => ({ cell, digit, tone: 'base' as const })),
            ...fins.map((cell) => ({ cell, digit, tone: 'fin' as const })),
          ];
          const name = size === 2 ? 'Finned X-Wing' : 'Finned Swordfish';
          const plain = size === 2 ? 'an X-Wing' : 'a Swordfish';
          out.push(
            finding({
              technique,
              eliminations: eliminations.sort((a, b2) => a.cell - b2.cell),
              pattern: [...body, ...fins].sort((a, b2) => a - b2),
              highlights,
              units: [
                ...base.map((l) => lineUnit(orientation, l)),
                ...covers.map((c) => crossUnit(orientation, c)),
                18 + finBox,
              ],
              digit,
              text: `${name} on ${digit}: ${lineWord(orientation, true)} ${numbers(base)} would form ${plain} on ${otherWord(orientation, true)} ${numbers(covers)}, except for the fin${fins.length > 1 ? 's' : ''} at ${listCells(fins)}. Either a fin is the ${digit}, or the fish holds and clears ${digit} from the rest of those ${otherWord(orientation, true)}. A cell that is in a cover ${otherWord(orientation, false)} and also shares box ${finBox + 1} with the fin loses ${digit} in both cases. Remove ${describeCandidates(eliminations)}.`,
            }),
          );
        }
      }
    }
  }
  return dedupe(out);
};

export const xWing = basicFish(2, 'x-wing');
export const swordfish = basicFish(3, 'swordfish');
export const jellyfish = basicFish(4, 'jellyfish');
export const finnedXWing = finnedFish(2, 'finned-x-wing');
export const finnedSwordfish = finnedFish(3, 'finned-swordfish');

