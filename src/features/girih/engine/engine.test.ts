// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// A detector that misfires teaches the wrong thing, so each one is pinned to a
// hand-built board where the right answer is known, and the whole mined bank
// is replayed through random disguises to show the lessons survive them.

import { describe, expect, it } from 'vitest';

import bank from '../data/positions.json';
import { applyTransform, decodePosition, encodePosition, randomTransform } from './bank';
import { TECHNIQUES, techniqueById } from './catalog';
import { ALL, cellAt, gridFromValues, parseValues, type Candidate, type Grid } from './grid';
import { createRng } from './random';
import { solutionOf } from './solver';
import { simplestStep } from './stepper';
import type { Finding, TechniqueId } from './types';

const blank = (): Grid => ({ values: new Uint8Array(81), cands: new Uint16Array(81).fill(ALL) });

const only = (grid: Grid, cell: number, digits: number[]): void => {
  grid.cands[cell] = digits.reduce((mask, d) => mask | (1 << (d - 1)), 0);
};

const strip = (grid: Grid, cells: number[], digit: number): void => {
  for (const cell of cells) {
    grid.cands[cell] &= ~(1 << (digit - 1));
  }
};

const key = (list: Candidate[]): string[] => list.map(({ cell, digit }) => `${cell}:${digit}`).sort();

const hasEffect = (findings: Finding[], expected: Candidate[]): boolean =>
  findings.some((f) => JSON.stringify(key(f.eliminations)) === JSON.stringify(key(expected)));

const row = (r: number): number[] => Array.from({ length: 9 }, (_, c) => cellAt(r, c));

describe('solver', () => {
  it('solves a known puzzle uniquely', () => {
    const puzzle = parseValues('530070000600195000098000060800060003400803001700020006060000280000419005000080079');
    const solution = solutionOf(puzzle);
    expect(solution && Array.from(solution).join('')).toBe(
      '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
    );
  });

  it('rejects a puzzle with two solutions', () => {
    expect(solutionOf(new Uint8Array(81))).toBeNull();
  });
});

describe('detectors on hand-built boards', () => {
  it('Naked Pair clears its two digits from the rest of the row', () => {
    const grid = blank();
    only(grid, cellAt(0, 0), [3, 7]);
    only(grid, cellAt(0, 4), [3, 7]);
    const expected = row(0)
      .filter((c) => c !== cellAt(0, 0) && c !== cellAt(0, 4))
      .flatMap((cell) => [3, 7].map((digit) => ({ cell, digit })));
    expect(hasEffect(techniqueById('naked-pair').detect(grid), expected)).toBe(true);
  });

  it('Hidden Pair clears the other candidates from its two cells', () => {
    const grid = blank();
    const others = row(2).filter((c) => c !== cellAt(2, 1) && c !== cellAt(2, 6));
    strip(grid, others, 4);
    strip(grid, others, 8);
    const expected = [cellAt(2, 1), cellAt(2, 6)].flatMap((cell) =>
      [1, 2, 3, 5, 6, 7, 9].map((digit) => ({ cell, digit })),
    );
    expect(hasEffect(techniqueById('hidden-pair').detect(grid), expected)).toBe(true);
  });

  it('Pointing clears the line outside the box', () => {
    const grid = blank();
    strip(grid, [9, 10, 11, 18, 19, 20], 9);
    const expected = [3, 4, 5, 6, 7, 8].map((cell) => ({ cell, digit: 9 }));
    expect(hasEffect(techniqueById('pointing').detect(grid), expected)).toBe(true);
  });

  it('Claiming clears the box outside the line', () => {
    const grid = blank();
    strip(grid, row(4).slice(3), 2);
    const expected = [cellAt(3, 0), cellAt(3, 1), cellAt(3, 2), cellAt(5, 0), cellAt(5, 1), cellAt(5, 2)].map((cell) => ({
      cell,
      digit: 2,
    }));
    expect(hasEffect(techniqueById('claiming').detect(grid), expected)).toBe(true);
  });

  it('X-Wing clears both cover columns', () => {
    const grid = blank();
    for (const r of [0, 5]) {
      strip(grid, row(r).filter((c) => c % 9 !== 1 && c % 9 !== 6), 5);
    }
    const expected = [0, 1, 2, 3, 4, 5, 6, 7, 8]
      .filter((r) => r !== 0 && r !== 5)
      .flatMap((r) => [cellAt(r, 1), cellAt(r, 6)])
      .map((cell) => ({ cell, digit: 5 }));
    expect(hasEffect(techniqueById('x-wing').detect(grid), expected)).toBe(true);
  });

  it('Skyscraper clears cells that see both tops', () => {
    const grid = blank();
    strip(grid, row(0).filter((c) => c !== cellAt(0, 0) && c !== cellAt(0, 4)), 6);
    strip(grid, row(4).filter((c) => c !== cellAt(4, 0) && c !== cellAt(4, 5)), 6);
    const expected = [cellAt(1, 5), cellAt(2, 5), cellAt(3, 4), cellAt(5, 4)].map((cell) => ({ cell, digit: 6 }));
    expect(hasEffect(techniqueById('skyscraper').detect(grid), expected)).toBe(true);
  });

  it('XY-Wing clears the shared digit where both wings see', () => {
    const grid = blank();
    only(grid, cellAt(4, 4), [1, 2]);
    only(grid, cellAt(4, 0), [1, 3]);
    only(grid, cellAt(0, 4), [2, 3]);
    expect(hasEffect(techniqueById('xy-wing').detect(grid), [{ cell: cellAt(0, 0), digit: 3 }])).toBe(true);
  });

  it('Unique Rectangle 1 clears the pair from the odd corner', () => {
    const grid = blank();
    for (const cell of [cellAt(0, 0), cellAt(0, 3), cellAt(1, 0)]) {
      only(grid, cell, [4, 7]);
    }
    expect(
      hasEffect(techniqueById('ur-type-1').detect(grid), [
        { cell: cellAt(1, 3), digit: 4 },
        { cell: cellAt(1, 3), digit: 7 },
      ]),
    ).toBe(true);
  });

  it('ALS-XZ clears Z where every Z in both sets is seen', () => {
    const grid = blank();
    only(grid, cellAt(0, 0), [1, 2]);
    only(grid, cellAt(0, 4), [1, 3]);
    only(grid, cellAt(1, 4), [2, 3]);
    const expected = [cellAt(0, 3), cellAt(0, 5), cellAt(1, 0), cellAt(1, 1), cellAt(1, 2)].map((cell) => ({
      cell,
      digit: 2,
    }));
    expect(hasEffect(techniqueById('als-xz').detect(grid), expected)).toBe(true);
  });
});

describe('position bank', () => {
  const positions = bank.positions as Record<TechniqueId, string[]>;

  it('round-trips a position through its encoding', () => {
    const code = positions['x-wing'][0];
    expect(encodePosition(decodePosition(code))).toBe(code);
  });

  it.each(TECHNIQUES.map((tech) => tech.id))('has drills for %s', (id) => {
    expect(positions[id]?.length ?? 0).toBeGreaterThan(0);
  });

  it.each(TECHNIQUES.map((tech) => tech.id))('keeps %s the simplest move under disguise, and sound', (id) => {
    const rng = createRng(id.length * 7919);
    for (const code of positions[id].slice(0, 6)) {
      const grid = applyTransform(decodePosition(code), randomTransform(rng));
      const step = simplestStep(grid, id);
      expect(step?.technique).toBe(id);
      const solution = solutionOf(grid.values);
      expect(solution).not.toBeNull();
      for (const item of step?.findings ?? []) {
        for (const { cell, digit } of item.placements) {
          expect(solution?.[cell]).toBe(digit);
        }
        for (const { cell, digit } of item.eliminations) {
          expect(solution?.[cell]).not.toBe(digit);
        }
      }
    }
  });

  it('shows singles drills with nothing eliminated yet', () => {
    for (const id of ['full-house', 'hidden-single', 'naked-single'] as TechniqueId[]) {
      for (const code of positions[id]) {
        expect(code.length).toBe(81);
        const grid = decodePosition(code);
        expect(Array.from(grid.cands)).toEqual(Array.from(gridFromValues(grid.values).cands));
      }
    }
  });
});
