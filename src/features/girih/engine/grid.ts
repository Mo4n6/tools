// Girih — board representation shared by the solver, the detectors and the UI.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Cells are indexed 0..80 row-major. Digits are 1..9 and live in a candidate
// mask as bit (digit - 1). Units are indexed 0..26: rows, then columns, then
// boxes. Everything here is pure and runs unchanged in Node, which is how the
// position miner uses it.

export type Grid = {
  /** 0 for an empty cell, otherwise the digit placed there. */
  values: Uint8Array;
  /** Candidate mask per cell; always 0 for a filled cell. */
  cands: Uint16Array;
};

export type Candidate = { cell: number; digit: number };

export const ALL = 0x1ff;

export const rowOf = (cell: number): number => Math.floor(cell / 9);
export const colOf = (cell: number): number => cell % 9;
export const boxOf = (cell: number): number => Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);
export const cellAt = (row: number, col: number): number => row * 9 + col;
export const bit = (digit: number): number => 1 << (digit - 1);

export const UNITS: number[][] = [];
for (let r = 0; r < 9; r += 1) {
  UNITS.push(Array.from({ length: 9 }, (_, c) => cellAt(r, c)));
}
for (let c = 0; c < 9; c += 1) {
  UNITS.push(Array.from({ length: 9 }, (_, r) => cellAt(r, c)));
}
for (let b = 0; b < 9; b += 1) {
  const r0 = Math.floor(b / 3) * 3;
  const c0 = (b % 3) * 3;
  const cells: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    cells.push(cellAt(r0 + Math.floor(i / 3), c0 + (i % 3)));
  }
  UNITS.push(cells);
}

export const ROW_UNIT = (row: number): number => row;
export const COL_UNIT = (col: number): number => 9 + col;
export const BOX_UNIT = (box: number): number => 18 + box;

/** The three units every cell belongs to: [row, column, box]. */
export const CELL_UNITS: number[][] = Array.from({ length: 81 }, (_, cell) => [
  rowOf(cell),
  9 + colOf(cell),
  18 + boxOf(cell),
]);

export const PEERS: number[][] = Array.from({ length: 81 }, (_, cell) => {
  const set = new Set<number>();
  for (const unit of CELL_UNITS[cell]) {
    for (const other of UNITS[unit]) {
      if (other !== cell) {
        set.add(other);
      }
    }
  }
  return [...set].sort((a, b) => a - b);
});

const SEES_TABLE = new Uint8Array(81 * 81);
for (let cell = 0; cell < 81; cell += 1) {
  for (const peer of PEERS[cell]) {
    SEES_TABLE[cell * 81 + peer] = 1;
  }
}

/** True when two distinct cells share a row, column or box. */
export const sees = (a: number, b: number): boolean => SEES_TABLE[a * 81 + b] === 1;

export const POPCOUNT = new Uint8Array(512);
export const MASK_DIGITS: number[][] = [];
for (let mask = 0; mask < 512; mask += 1) {
  const digits: number[] = [];
  for (let d = 1; d <= 9; d += 1) {
    if (mask & bit(d)) {
      digits.push(d);
    }
  }
  POPCOUNT[mask] = digits.length;
  MASK_DIGITS.push(digits);
}

export const maskOf = (digits: number[]): number => digits.reduce((mask, d) => mask | bit(d), 0);

export const cellName = (cell: number): string => `r${rowOf(cell) + 1}c${colOf(cell) + 1}`;

export const unitName = (unit: number): string => {
  if (unit < 9) {
    return `row ${unit + 1}`;
  }
  if (unit < 18) {
    return `column ${unit - 8}`;
  }
  return `box ${unit - 17}`;
};

export const unitKind = (unit: number): 'row' | 'column' | 'box' => {
  if (unit < 9) {
    return 'row';
  }
  return unit < 18 ? 'column' : 'box';
};

export const listCells = (cells: number[]): string => joinWords(cells.map(cellName));

export const listDigits = (digits: number[]): string => joinWords(digits.map(String));

export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const joinWords = (words: string[]): string => {
  if (words.length <= 1) {
    return words.join('');
  }
  if (words.length === 2) {
    return `${words[0]} and ${words[1]}`;
  }
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
};

export const describeCandidates = (list: Candidate[]): string => {
  const byDigit = new Map<number, number[]>();
  for (const { cell, digit } of list) {
    const cells = byDigit.get(digit) ?? [];
    cells.push(cell);
    byDigit.set(digit, cells);
  }
  return joinWords(
    [...byDigit.entries()]
      .sort(([a], [b]) => a - b)
      .map(([digit, cells]) => `${digit} from ${listCells([...cells].sort((a, b) => a - b))}`),
  );
};

export const emptyGrid = (): Grid => ({ values: new Uint8Array(81), cands: new Uint16Array(81) });

export const cloneGrid = (grid: Grid): Grid => ({
  values: new Uint8Array(grid.values),
  cands: new Uint16Array(grid.cands),
});

/** Candidates implied by the placed digits alone, with nothing eliminated by technique. */
export const naiveCandidates = (values: Uint8Array): Uint16Array => {
  const cands = new Uint16Array(81);
  for (let cell = 0; cell < 81; cell += 1) {
    if (values[cell] !== 0) {
      continue;
    }
    let mask = ALL;
    for (const peer of PEERS[cell]) {
      const v = values[peer];
      if (v !== 0) {
        mask &= ~bit(v);
      }
    }
    cands[cell] = mask;
  }
  return cands;
};

export const gridFromValues = (values: Uint8Array): Grid => ({
  values: new Uint8Array(values),
  cands: naiveCandidates(values),
});

/** Parses 81 characters of digits, with 0 or . for an empty cell. */
export const parseValues = (text: string): Uint8Array => {
  const clean = text.replace(/\s+/g, '');
  if (clean.length !== 81) {
    throw new Error(`expected 81 cells, got ${clean.length}`);
  }
  const values = new Uint8Array(81);
  for (let i = 0; i < 81; i += 1) {
    const ch = clean[i];
    values[i] = ch === '.' ? 0 : Number(ch);
    if (Number.isNaN(values[i]) || values[i] > 9) {
      throw new Error(`bad cell character ${ch}`);
    }
  }
  return values;
};

export const formatValues = (values: Uint8Array): string => Array.from(values, (v) => String(v)).join('');

export const place = (grid: Grid, cell: number, digit: number): void => {
  grid.values[cell] = digit;
  grid.cands[cell] = 0;
  const b = bit(digit);
  for (const peer of PEERS[cell]) {
    grid.cands[peer] &= ~b;
  }
};

export const eliminate = (grid: Grid, cell: number, digit: number): void => {
  grid.cands[cell] &= ~bit(digit);
};

export const has = (grid: Grid, cell: number, digit: number): boolean => (grid.cands[cell] & bit(digit)) !== 0;

/** Cells of a unit that still hold a digit as a candidate. */
export const positionsIn = (grid: Grid, unit: number, digit: number): number[] => {
  const b = bit(digit);
  const out: number[] = [];
  for (const cell of UNITS[unit]) {
    if (grid.cands[cell] & b) {
      out.push(cell);
    }
  }
  return out;
};

export const emptyCount = (grid: Grid): number => {
  let count = 0;
  for (let i = 0; i < 81; i += 1) {
    if (grid.values[i] === 0) {
      count += 1;
    }
  }
  return count;
};

/** Cells that see every cell in the list (the cells themselves excluded). */
export const commonPeers = (cells: number[]): number[] => {
  if (cells.length === 0) {
    return [];
  }
  return PEERS[cells[0]].filter((peer) => !cells.includes(peer) && cells.every((cell) => cell === peer || sees(cell, peer)));
};

/** Units that contain every cell in the list. */
export const commonUnits = (cells: number[]): number[] => {
  if (cells.length === 0) {
    return [];
  }
  return CELL_UNITS[cells[0]].filter((unit) => cells.every((cell) => CELL_UNITS[cell].includes(unit)));
};

export function* combinations<T>(items: T[], size: number, start = 0, prefix: T[] = []): Generator<T[]> {
  if (prefix.length === size) {
    yield prefix;
    return;
  }
  for (let i = start; i <= items.length - (size - prefix.length); i += 1) {
    yield* combinations(items, size, i + 1, [...prefix, items[i]]);
  }
}

export const candidateKey = ({ cell, digit }: Candidate): number => cell * 9 + (digit - 1);

export const sortCandidates = (list: Candidate[]): Candidate[] =>
  [...list].sort((a, b) => candidateKey(a) - candidateKey(b));

export const uniqueCandidates = (list: Candidate[]): Candidate[] => {
  const seen = new Set<number>();
  const out: Candidate[] = [];
  for (const item of list) {
    const key = candidateKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return sortCandidates(out);
};
