// Girih — uniqueness techniques: Unique Rectangle types 1, 2 and 4, and BUG+1.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// These lean on the promise that a proper puzzle has exactly one solution. Four
// cells at the corners of a rectangle spanning two boxes, all holding only the
// same two digits, could swap those digits and give a second solution — the
// "deadly pattern". A technique here finds the move that keeps it from forming.

import {
  MASK_DIGITS,
  POPCOUNT,
  ROW_UNIT,
  bit,
  boxOf,
  cellAt,
  cellName,
  colOf,
  commonPeers,
  commonUnits,
  describeCandidates,
  positionsIn,
  rowOf,
  unitName,
  type Candidate,
  type Grid,
} from '../grid.ts';
import { dedupe, finding, type Finding, type Highlight } from '../types.ts';

type Rectangle = { cells: [number, number, number, number]; a: number; b: number };

/** Rectangles of four empty cells over exactly two boxes, with a digit pair common to all four. */
const rectangles = (grid: Grid): Rectangle[] => {
  const out: Rectangle[] = [];
  for (let r1 = 0; r1 < 9; r1 += 1) {
    for (let r2 = r1 + 1; r2 < 9; r2 += 1) {
      for (let c1 = 0; c1 < 9; c1 += 1) {
        for (let c2 = c1 + 1; c2 < 9; c2 += 1) {
          const cells: [number, number, number, number] = [cellAt(r1, c1), cellAt(r1, c2), cellAt(r2, c1), cellAt(r2, c2)];
          if (cells.some((cell) => grid.values[cell] !== 0)) {
            continue;
          }
          if (new Set(cells.map(boxOf)).size !== 2) {
            continue;
          }
          const common = cells.reduce((mask, cell) => mask & grid.cands[cell], 0x1ff);
          const digits = MASK_DIGITS[common];
          for (let i = 0; i < digits.length; i += 1) {
            for (let j = i + 1; j < digits.length; j += 1) {
              out.push({ cells, a: digits[i], b: digits[j] });
            }
          }
        }
      }
    }
  }
  return out;
};

const shareLine = (x: number, y: number): boolean => rowOf(x) === rowOf(y) || colOf(x) === colOf(y);

const rectHighlights = (cells: number[], a: number, b: number): Highlight[] =>
  cells.flatMap((cell) => [
    { cell, digit: a, tone: 'base' as const },
    { cell, digit: b, tone: 'base' as const },
  ]);

const rectName = (cells: number[]): string => cells.map(cellName).join(', ');

export const urType1 = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (const { cells, a, b } of rectangles(grid)) {
    const pair = bit(a) | bit(b);
    const floor = cells.filter((cell) => grid.cands[cell] === pair);
    if (floor.length !== 3) {
      continue;
    }
    const corner = cells.find((cell) => grid.cands[cell] !== pair) as number;
    const eliminations: Candidate[] = [{ cell: corner, digit: a }, { cell: corner, digit: b }];
    out.push(
      finding({
        technique: 'ur-type-1',
        eliminations,
        pattern: [...cells].sort((m, n) => m - n),
        highlights: rectHighlights(cells, a, b),
        units: [],
        text: `The rectangle ${rectName(cells)} spans two boxes. Three corners hold only ${a} and ${b}. If ${cellName(corner)} were ${a} or ${b} as well, all four corners would be ${a}/${b} and could swap — two solutions. A proper puzzle has one, so ${cellName(corner)} is neither. Remove ${describeCandidates(eliminations)}.`,
      }),
    );
  }
  return dedupe(out);
};

export const urType2 = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (const { cells, a, b } of rectangles(grid)) {
    const pair = bit(a) | bit(b);
    const floor = cells.filter((cell) => grid.cands[cell] === pair);
    const roof = cells.filter((cell) => grid.cands[cell] !== pair);
    if (floor.length !== 2 || !shareLine(roof[0], roof[1])) {
      continue;
    }
    if (grid.cands[roof[0]] !== grid.cands[roof[1]] || POPCOUNT[grid.cands[roof[0]]] !== 3) {
      continue;
    }
    const extra = MASK_DIGITS[grid.cands[roof[0]] & ~pair][0];
    const eliminations = commonPeers(roof)
      .filter((cell) => grid.cands[cell] & bit(extra))
      .map((cell) => ({ cell, digit: extra }));
    if (eliminations.length === 0) {
      continue;
    }
    out.push(
      finding({
        technique: 'ur-type-2',
        eliminations,
        pattern: [...cells].sort((m, n) => m - n),
        highlights: [...rectHighlights(cells, a, b), ...roof.map((cell) => ({ cell, digit: extra, tone: 'fin' as const }))],
        units: commonUnits(roof),
        digit: extra,
        text: `The rectangle ${rectName(cells)} spans two boxes. ${cellName(floor[0])} and ${cellName(floor[1])} hold only ${a}/${b}, and the other two corners, ${cellName(roof[0])} and ${cellName(roof[1])}, hold ${a}/${b} plus ${extra}. If neither of those were ${extra}, the four corners would be a swappable ${a}/${b} rectangle with two solutions. So one of them is ${extra}, and any cell that sees both can't be. Remove ${describeCandidates(eliminations)}.`,
      }),
    );
  }
  return dedupe(out);
};

export const urType4 = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (const { cells, a, b } of rectangles(grid)) {
    const pair = bit(a) | bit(b);
    const floor = cells.filter((cell) => grid.cands[cell] === pair);
    const roof = cells.filter((cell) => grid.cands[cell] !== pair);
    if (floor.length !== 2 || !shareLine(roof[0], roof[1])) {
      continue;
    }
    for (const [locked, other] of [[a, b], [b, a]]) {
      for (const unit of commonUnits(roof)) {
        const spots = positionsIn(grid, unit, locked);
        if (spots.length !== 2 || !roof.every((cell) => spots.includes(cell))) {
          continue;
        }
        const eliminations = roof.map((cell) => ({ cell, digit: other }));
        out.push(
          finding({
            technique: 'ur-type-4',
            eliminations,
            pattern: [...cells].sort((m, n) => m - n),
            highlights: [
              ...floor.flatMap((cell) => [
                { cell, digit: a, tone: 'base' as const },
                { cell, digit: b, tone: 'base' as const },
              ]),
              ...roof.map((cell) => ({ cell, digit: locked, tone: 'on' as const })),
            ],
            units: [unit],
            links: [{ from: { cell: roof[0], digit: locked }, to: { cell: roof[1], digit: locked }, strong: true }],
            text: `The rectangle ${rectName(cells)} spans two boxes, with ${cellName(floor[0])} and ${cellName(floor[1])} holding only ${a}/${b}. In ${unitName(unit)}, ${locked} can only go in the other two corners, ${cellName(roof[0])} and ${cellName(roof[1])}, so one of them is ${locked}. If the other were ${other}, the corners would form a swappable ${a}/${b} rectangle with two solutions. So neither roof cell can be ${other}. Remove ${describeCandidates(eliminations)}.`,
          }),
        );
      }
    }
  }
  return dedupe(out);
};

export const bugPlusOne = (grid: Grid): Finding[] => {
  let odd = -1;
  for (let cell = 0; cell < 81; cell += 1) {
    if (grid.values[cell] !== 0) {
      continue;
    }
    const n = POPCOUNT[grid.cands[cell]];
    if (n === 2) {
      continue;
    }
    if (n !== 3 || odd !== -1) {
      return [];
    }
    odd = cell;
  }
  if (odd === -1) {
    return [];
  }
  const row = ROW_UNIT(rowOf(odd));
  // The pattern only bites if dropping the extra candidate leaves every
  // unplaced digit exactly twice in every unit. Check that, rather than trust
  // the count in one row.
  const digit = MASK_DIGITS[grid.cands[odd]].find((d) => {
    const saved = grid.cands[odd];
    grid.cands[odd] = saved & ~bit(d);
    let deadly = true;
    for (let unit = 0; unit < 27 && deadly; unit += 1) {
      for (let x = 1; x <= 9; x += 1) {
        const n = positionsIn(grid, unit, x).length;
        if (n !== 0 && n !== 2) {
          deadly = false;
          break;
        }
      }
    }
    grid.cands[odd] = saved;
    return deadly;
  });
  if (digit === undefined) {
    return [];
  }
  return [
    finding({
      technique: 'bug-plus-one',
      placements: [{ cell: odd, digit }],
      pattern: [odd],
      highlights: MASK_DIGITS[grid.cands[odd]].map((d) => ({ cell: odd, digit: d, tone: d === digit ? 'on' : 'base' })),
      units: [row],
      digit,
      text: `Every unsolved cell except ${cellName(odd)} has exactly two candidates. If ${cellName(odd)} lost its extra one, every digit would appear exactly twice in every row, column and box — a pattern with two solutions. The candidate that breaks it is the one appearing three times in ${unitName(row)}: ${digit}. So ${cellName(odd)} is ${digit}.`,
    }),
  ];
};
