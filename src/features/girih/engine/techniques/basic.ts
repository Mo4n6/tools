// Girih — singles, intersections and naked/hidden subsets.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import {
  BOX_UNIT,
  CELL_UNITS,
  MASK_DIGITS,
  POPCOUNT,
  UNITS,
  bit,
  boxOf,
  capitalize,
  cellName,
  combinations,
  commonUnits,
  describeCandidates,
  joinWords,
  listCells,
  listDigits,
  positionsIn,
  sortCandidates,
  unitName,
  type Candidate,
  type Grid,
} from '../grid.ts';
import { dedupe, finding, type Finding, type Highlight, type TechniqueId } from '../types.ts';

const placedIn = (grid: Grid, unit: number): number => {
  let mask = 0;
  for (const cell of UNITS[unit]) {
    if (grid.values[cell]) {
      mask |= bit(grid.values[cell]);
    }
  }
  return mask;
};

const emptyCells = (grid: Grid, unit: number): number[] => UNITS[unit].filter((cell) => grid.values[cell] === 0);

export const fullHouse = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  const seen = new Set<number>();
  for (let unit = 0; unit < 27; unit += 1) {
    const empties = emptyCells(grid, unit);
    if (empties.length !== 1) {
      continue;
    }
    const cell = empties[0];
    const missing = 0x1ff & ~placedIn(grid, unit);
    if (POPCOUNT[missing] !== 1 || !(grid.cands[cell] & missing) || seen.has(cell)) {
      continue;
    }
    seen.add(cell);
    const digit = MASK_DIGITS[missing][0];
    out.push(
      finding({
        technique: 'full-house',
        placements: [{ cell, digit }],
        units: [unit],
        text: `${cellName(cell)} is the only empty cell left in ${unitName(unit)}, and the only digit ${unitName(unit)} is still missing is ${digit}. So ${cellName(cell)} is ${digit}.`,
      }),
    );
  }
  return out;
};

export const hiddenSingle = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  const seen = new Set<string>();
  // Boxes first: a hidden single in a box is the one people spot first.
  const order = [...Array.from({ length: 9 }, (_, i) => 18 + i), ...Array.from({ length: 18 }, (_, i) => i)];
  for (const unit of order) {
    const placed = placedIn(grid, unit);
    for (let digit = 1; digit <= 9; digit += 1) {
      if (placed & bit(digit)) {
        continue;
      }
      const spots = positionsIn(grid, unit, digit);
      if (spots.length !== 1) {
        continue;
      }
      const cell = spots[0];
      const key = `${cell}:${digit}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(
        finding({
          technique: 'hidden-single',
          placements: [{ cell, digit }],
          units: [unit],
          digit,
          text: `In ${unitName(unit)}, ${digit} has only one possible home: ${cellName(cell)}. Every other empty cell there is ruled out because it already sees a ${digit}. So ${cellName(cell)} is ${digit}.`,
        }),
      );
    }
  }
  return out;
};

export const nakedSingle = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (let cell = 0; cell < 81; cell += 1) {
    if (grid.values[cell] !== 0 || POPCOUNT[grid.cands[cell]] !== 1) {
      continue;
    }
    const digit = MASK_DIGITS[grid.cands[cell]][0];
    out.push(
      finding({
        technique: 'naked-single',
        placements: [{ cell, digit }],
        units: [...CELL_UNITS[cell]],
        text: `Look at everything ${cellName(cell)} can see: its row, column and box between them rule out every digit except ${digit}. So ${cellName(cell)} is ${digit}.`,
      }),
    );
  }
  return out;
};

export const pointing = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (let box = 0; box < 9; box += 1) {
    const unit = BOX_UNIT(box);
    for (let digit = 1; digit <= 9; digit += 1) {
      const spots = positionsIn(grid, unit, digit);
      if (spots.length < 2) {
        continue;
      }
      for (const line of commonUnits(spots).filter((u) => u < 18)) {
        const eliminations: Candidate[] = UNITS[line]
          .filter((cell) => boxOf(cell) !== box && grid.cands[cell] & bit(digit))
          .map((cell) => ({ cell, digit }));
        if (eliminations.length === 0) {
          continue;
        }
        out.push(
          finding({
            technique: 'pointing',
            eliminations,
            pattern: spots,
            highlights: spots.map((cell) => ({ cell, digit, tone: 'base' })),
            units: [unit, line],
            digit,
            text: `In ${unitName(unit)}, every possible ${digit} sits in ${unitName(line)}. Box ${box + 1} must have its ${digit} somewhere, so it will be in ${unitName(line)}, inside the box. That rules ${digit} out of the rest of ${unitName(line)}: remove ${describeCandidates(eliminations)}.`,
          }),
        );
      }
    }
  }
  return out;
};

export const claiming = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (let line = 0; line < 18; line += 1) {
    for (let digit = 1; digit <= 9; digit += 1) {
      const spots = positionsIn(grid, line, digit);
      if (spots.length < 2) {
        continue;
      }
      const box = boxOf(spots[0]);
      if (!spots.every((cell) => boxOf(cell) === box)) {
        continue;
      }
      const eliminations: Candidate[] = UNITS[BOX_UNIT(box)]
        .filter((cell) => !UNITS[line].includes(cell) && grid.cands[cell] & bit(digit))
        .map((cell) => ({ cell, digit }));
      if (eliminations.length === 0) {
        continue;
      }
      out.push(
        finding({
          technique: 'claiming',
          eliminations,
          pattern: spots,
          highlights: spots.map((cell) => ({ cell, digit, tone: 'base' })),
          units: [line, BOX_UNIT(box)],
          digit,
          text: `In ${unitName(line)}, every possible ${digit} lies inside box ${box + 1}. ${capitalize(unitName(line))} needs a ${digit}, so box ${box + 1} gets its ${digit} from ${unitName(line)} and nowhere else. Remove ${describeCandidates(eliminations)}.`,
        }),
      );
    }
  }
  return out;
};

const nakedSubset = (size: number, technique: TechniqueId) => (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (let unit = 0; unit < 27; unit += 1) {
    const pool = emptyCells(grid, unit).filter((cell) => {
      const n = POPCOUNT[grid.cands[cell]];
      return n >= 2 && n <= size;
    });
    for (const cells of combinations(pool, size)) {
      let union = 0;
      for (const cell of cells) {
        union |= grid.cands[cell];
      }
      if (POPCOUNT[union] !== size) {
        continue;
      }
      const digits = MASK_DIGITS[union];
      const units = commonUnits(cells);
      const eliminations: Candidate[] = [];
      for (const u of units) {
        for (const cell of UNITS[u]) {
          if (cells.includes(cell) || grid.values[cell] !== 0) {
            continue;
          }
          for (const digit of digits) {
            if (grid.cands[cell] & bit(digit) && !eliminations.some((e) => e.cell === cell && e.digit === digit)) {
              eliminations.push({ cell, digit });
            }
          }
        }
      }
      if (eliminations.length === 0) {
        continue;
      }
      const highlights: Highlight[] = [];
      for (const cell of cells) {
        for (const digit of MASK_DIGITS[grid.cands[cell]]) {
          highlights.push({ cell, digit, tone: 'base' });
        }
      }
      out.push(
        finding({
          technique,
          eliminations: sortCandidates(eliminations),
          pattern: [...cells],
          highlights,
          units,
          text: `${listCells(cells)} share ${unitName(units[0])}${units.length > 1 ? ` and ${unitName(units[1])}` : ''}, and between them they hold only ${listDigits(digits)}. ${size} cells, ${size} digits: those digits are locked into those cells, so no other cell in ${joinWords(units.map(unitName))} can take them. Remove ${describeCandidates(eliminations)}.`,
        }),
      );
    }
  }
  return dedupe(out);
};

const hiddenSubset = (size: number, technique: TechniqueId) => (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (let unit = 0; unit < 27; unit += 1) {
    const placed = placedIn(grid, unit);
    const where = new Map<number, number[]>();
    let broken = false;
    for (let digit = 1; digit <= 9; digit += 1) {
      if (placed & bit(digit)) {
        continue;
      }
      const spots = positionsIn(grid, unit, digit);
      if (spots.length === 0) {
        broken = true;
        break;
      }
      if (spots.length >= 2 && spots.length <= size) {
        where.set(digit, spots);
      }
    }
    if (broken) {
      continue;
    }
    for (const digits of combinations([...where.keys()], size)) {
      const cellSet = new Set<number>();
      for (const digit of digits) {
        for (const cell of where.get(digit) ?? []) {
          cellSet.add(cell);
        }
      }
      if (cellSet.size !== size) {
        continue;
      }
      const cells = [...cellSet].sort((a, b) => a - b);
      const keep = digits.reduce((mask, d) => mask | bit(d), 0);
      const eliminations: Candidate[] = [];
      for (const cell of cells) {
        for (const digit of MASK_DIGITS[grid.cands[cell] & ~keep]) {
          eliminations.push({ cell, digit });
        }
      }
      if (eliminations.length === 0) {
        continue;
      }
      const highlights: Highlight[] = [];
      for (const cell of cells) {
        for (const digit of digits) {
          if (grid.cands[cell] & bit(digit)) {
            highlights.push({ cell, digit, tone: 'base' });
          }
        }
      }
      out.push(
        finding({
          technique,
          eliminations: sortCandidates(eliminations),
          pattern: cells,
          highlights,
          units: [unit],
          text: `In ${unitName(unit)}, ${listDigits(digits)} can only go in ${listCells(cells)}. ${size} digits confined to ${size} cells means those cells are taken by exactly those digits, so every other candidate in them can go. Remove ${describeCandidates(eliminations)}.`,
        }),
      );
    }
  }
  return dedupe(out);
};

export const nakedPair = nakedSubset(2, 'naked-pair');
export const nakedTriple = nakedSubset(3, 'naked-triple');
export const nakedQuad = nakedSubset(4, 'naked-quad');
export const hiddenPair = hiddenSubset(2, 'hidden-pair');
export const hiddenTriple = hiddenSubset(3, 'hidden-triple');
export const hiddenQuad = hiddenSubset(4, 'hidden-quad');
