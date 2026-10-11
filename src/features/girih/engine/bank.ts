// Girih — the position bank: encoding, decoding and symmetry disguises.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// A position is a board frozen at the moment one technique is the simplest
// move. It is stored as 81 digits (0 for empty) followed by the candidates
// eliminated so far, each as two base-36 characters (cell * 9 + digit - 1).
// Candidates not listed are whatever the placed digits leave open.
//
// Drills never show a stored position as-is. Each draw relabels the digits,
// shuffles bands, stacks, and the rows and columns inside them, and maybe
// transposes: 9! x 6^4 x 6^4 x 2, about 1.2 trillion disguises per position.
// Every technique here is blind to those changes, so the lesson survives.

import { bit, cellAt, colOf, naiveCandidates, rowOf, type Grid } from './grid.ts';
import { shuffle, type Rng } from './random.ts';

export const encodePosition = (grid: Grid): string => {
  const values = Array.from(grid.values, String).join('');
  const naive = naiveCandidates(grid.values);
  let eliminated = '';
  for (let cell = 0; cell < 81; cell += 1) {
    const gone = naive[cell] & ~grid.cands[cell];
    for (let digit = 1; digit <= 9; digit += 1) {
      if (gone & bit(digit)) {
        eliminated += (cell * 9 + digit - 1).toString(36).padStart(2, '0');
      }
    }
  }
  return values + eliminated;
};

export const decodePosition = (code: string): Grid => {
  const values = new Uint8Array(81);
  for (let i = 0; i < 81; i += 1) {
    values[i] = code.charCodeAt(i) - 48;
  }
  const cands = naiveCandidates(values);
  for (let i = 81; i + 1 < code.length; i += 2) {
    const index = parseInt(code.slice(i, i + 2), 36);
    const cell = Math.floor(index / 9);
    cands[cell] &= ~bit((index % 9) + 1);
  }
  return { values, cands };
};

export type Transform = {
  digits: number[]; // digits[old] = new, index 0 unused
  rows: number[]; // rows[old] = new
  cols: number[];
  transpose: boolean;
};

export const IDENTITY: Transform = {
  digits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  rows: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  cols: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  transpose: false,
};

const lineShuffle = (rng: Rng): number[] => {
  const bands = shuffle(rng, [0, 1, 2]);
  const order: number[] = [];
  for (const band of bands) {
    for (const offset of shuffle(rng, [0, 1, 2])) {
      order.push(band * 3 + offset);
    }
  }
  // order[new] = old; invert to old -> new.
  const map = new Array<number>(9);
  order.forEach((old, index) => {
    map[old] = index;
  });
  return map;
};

export const randomTransform = (rng: Rng): Transform => ({
  digits: [0, ...shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9])],
  rows: lineShuffle(rng),
  cols: lineShuffle(rng),
  transpose: rng() < 0.5,
});

export const mapCell = (t: Transform, cell: number): number => {
  const r = t.rows[rowOf(cell)];
  const c = t.cols[colOf(cell)];
  return t.transpose ? cellAt(c, r) : cellAt(r, c);
};

export const mapMask = (t: Transform, mask: number): number => {
  let out = 0;
  for (let digit = 1; digit <= 9; digit += 1) {
    if (mask & bit(digit)) {
      out |= bit(t.digits[digit]);
    }
  }
  return out;
};

export const applyTransform = (grid: Grid, t: Transform): Grid => {
  const values = new Uint8Array(81);
  const cands = new Uint16Array(81);
  for (let cell = 0; cell < 81; cell += 1) {
    const target = mapCell(t, cell);
    values[target] = grid.values[cell] === 0 ? 0 : t.digits[grid.values[cell]];
    cands[target] = mapMask(t, grid.cands[cell]);
  }
  return { values, cands };
};
