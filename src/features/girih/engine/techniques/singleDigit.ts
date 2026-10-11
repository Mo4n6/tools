// Girih — single-digit patterns built on strong links: Skyscraper,
// 2-String Kite, Empty Rectangle, Simple Colouring and X-Chain.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// A strong link on a digit is a unit where it has exactly two places: one of
// the two must be it. A weak link is any two candidates that cannot both be
// true. Every pattern here chains those two facts together.

import {
  BOX_UNIT,
  COL_UNIT,
  ROW_UNIT,
  bit,
  boxOf,
  cellAt,
  cellName,
  colOf,
  commonPeers,
  describeCandidates,
  positionsIn,
  rowOf,
  sees,
  unitName,
  type Candidate,
  type Grid,
} from '../grid.ts';
import { dedupe, dedupeByEffect, finding, type Finding, type Highlight, type Link } from '../types.ts';

/** Every unit where the digit has exactly two places, as [unit, a, b]. */
const strongLinks = (grid: Grid, digit: number): Array<[number, number, number]> => {
  const out: Array<[number, number, number]> = [];
  for (let unit = 0; unit < 27; unit += 1) {
    const spots = positionsIn(grid, unit, digit);
    if (spots.length === 2) {
      out.push([unit, spots[0], spots[1]]);
    }
  }
  return out;
};

const eliminateSeeingBoth = (grid: Grid, a: number, b: number, digit: number, exclude: number[]): Candidate[] =>
  commonPeers([a, b])
    .filter((cell) => !exclude.includes(cell) && grid.cands[cell] & bit(digit))
    .map((cell) => ({ cell, digit }));

export const skyscraper = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (let digit = 1; digit <= 9; digit += 1) {
    for (const lines of [
      Array.from({ length: 9 }, (_, i) => ROW_UNIT(i)),
      Array.from({ length: 9 }, (_, i) => COL_UNIT(i)),
    ]) {
      const isRows = lines[0] === 0;
      const cross = isRows ? colOf : rowOf;
      const pairs = lines
        .map((unit) => [unit, positionsIn(grid, unit, digit)] as const)
        .filter(([, spots]) => spots.length === 2);
      for (let i = 0; i < pairs.length; i += 1) {
        for (let j = i + 1; j < pairs.length; j += 1) {
          const [u1, s1] = pairs[i];
          const [u2, s2] = pairs[j];
          for (const [b1, t1] of [[s1[0], s1[1]], [s1[1], s1[0]]]) {
            for (const [b2, t2] of [[s2[0], s2[1]], [s2[1], s2[0]]]) {
              if (cross(b1) !== cross(b2) || cross(t1) === cross(t2)) {
                continue;
              }
              const eliminations = eliminateSeeingBoth(grid, t1, t2, digit, [b1, b2]);
              if (eliminations.length === 0) {
                continue;
              }
              const baseLine = isRows ? COL_UNIT(colOf(b1)) : ROW_UNIT(rowOf(b1));
              out.push(
                finding({
                  technique: 'skyscraper',
                  eliminations,
                  pattern: [b1, t1, b2, t2].sort((m, n) => m - n),
                  highlights: [
                    { cell: b1, digit, tone: 'off' },
                    { cell: b2, digit, tone: 'off' },
                    { cell: t1, digit, tone: 'on' },
                    { cell: t2, digit, tone: 'on' },
                  ],
                  units: [u1, u2, baseLine],
                  links: [
                    { from: { cell: t1, digit }, to: { cell: b1, digit }, strong: true },
                    { from: { cell: b1, digit }, to: { cell: b2, digit }, strong: false },
                    { from: { cell: b2, digit }, to: { cell: t2, digit }, strong: true },
                  ],
                  digit,
                  text: `${capital(unitName(u1))} and ${unitName(u2)} each have exactly two places for ${digit}. Their bases, ${cellName(b1)} and ${cellName(b2)}, share ${unitName(baseLine)}, so at most one of them is ${digit}. That means at least one of the tops, ${cellName(t1)} or ${cellName(t2)}, is ${digit}, and any cell that sees both tops can't be. Remove ${describeCandidates(eliminations)}.`,
                }),
              );
            }
          }
        }
      }
    }
  }
  return dedupe(out);
};

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const twoStringKite = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (let digit = 1; digit <= 9; digit += 1) {
    const rows = Array.from({ length: 9 }, (_, i) => [ROW_UNIT(i), positionsIn(grid, ROW_UNIT(i), digit)] as const).filter(
      ([, s]) => s.length === 2 && boxOf(s[0]) !== boxOf(s[1]),
    );
    const cols = Array.from({ length: 9 }, (_, i) => [COL_UNIT(i), positionsIn(grid, COL_UNIT(i), digit)] as const).filter(
      ([, s]) => s.length === 2 && boxOf(s[0]) !== boxOf(s[1]),
    );
    for (const [ru, rs] of rows) {
      for (const [cu, cs] of cols) {
        for (const [p, q] of [[rs[0], rs[1]], [rs[1], rs[0]]]) {
          for (const [u, v] of [[cs[0], cs[1]], [cs[1], cs[0]]]) {
            if (p === u || q === v || p === v || q === u || boxOf(p) !== boxOf(u)) {
              continue;
            }
            const eliminations = eliminateSeeingBoth(grid, q, v, digit, [p, u]);
            if (eliminations.length === 0) {
              continue;
            }
            out.push(
              finding({
                technique: 'two-string-kite',
                eliminations,
                pattern: [p, q, u, v].sort((m, n) => m - n),
                highlights: [
                  { cell: p, digit, tone: 'off' },
                  { cell: u, digit, tone: 'off' },
                  { cell: q, digit, tone: 'on' },
                  { cell: v, digit, tone: 'on' },
                ],
                units: [ru, cu, BOX_UNIT(boxOf(p))],
                links: [
                  { from: { cell: q, digit }, to: { cell: p, digit }, strong: true },
                  { from: { cell: p, digit }, to: { cell: u, digit }, strong: false },
                  { from: { cell: u, digit }, to: { cell: v, digit }, strong: true },
                ],
                digit,
                text: `${capital(unitName(ru))} has ${digit} only at ${cellName(p)} and ${cellName(q)}; ${unitName(cu)} has it only at ${cellName(u)} and ${cellName(v)}. ${cellName(p)} and ${cellName(u)} share box ${boxOf(p) + 1}, so they can't both be ${digit}, and that forces ${digit} into ${cellName(q)} or ${cellName(v)}. Any cell that sees both of those can't be ${digit}. Remove ${describeCandidates(eliminations)}.`,
              }),
            );
          }
        }
      }
    }
  }
  return dedupe(out);
};

export const emptyRectangle = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (let digit = 1; digit <= 9; digit += 1) {
    const b = bit(digit);
    for (let box = 0; box < 9; box += 1) {
      const spots = positionsIn(grid, BOX_UNIT(box), digit);
      if (spots.length < 2) {
        continue;
      }
      const r0 = Math.floor(box / 3) * 3;
      const c0 = (box % 3) * 3;
      for (let R = r0; R < r0 + 3; R += 1) {
        for (let C = c0; C < c0 + 3; C += 1) {
          if (!spots.every((cell) => rowOf(cell) === R || colOf(cell) === C)) {
            continue;
          }
          if (!spots.some((cell) => rowOf(cell) !== R) || !spots.some((cell) => colOf(cell) !== C)) {
            continue;
          }
          // Strong link in a column outside the box's stack, one end in row R.
          for (let col = 0; col < 9; col += 1) {
            if (Math.floor(col / 3) === box % 3) {
              continue;
            }
            const ends = positionsIn(grid, COL_UNIT(col), digit);
            if (ends.length !== 2) {
              continue;
            }
            const near = ends.find((cell) => rowOf(cell) === R);
            const far = ends.find((cell) => rowOf(cell) !== R);
            if (near === undefined || far === undefined || Math.floor(rowOf(far) / 3) === Math.floor(box / 3)) {
              continue;
            }
            const target = cellAt(rowOf(far), C);
            if (!(grid.cands[target] & b)) {
              continue;
            }
            out.push(
              erFinding(grid, digit, box, R, C, spots, near, far, target, COL_UNIT(col), COL_UNIT(C)),
            );
          }
          // Strong link in a row outside the box's band, one end in column C.
          for (let row = 0; row < 9; row += 1) {
            if (Math.floor(row / 3) === Math.floor(box / 3)) {
              continue;
            }
            const ends = positionsIn(grid, ROW_UNIT(row), digit);
            if (ends.length !== 2) {
              continue;
            }
            const near = ends.find((cell) => colOf(cell) === C);
            const far = ends.find((cell) => colOf(cell) !== C);
            if (near === undefined || far === undefined || Math.floor(colOf(far) / 3) === box % 3) {
              continue;
            }
            const target = cellAt(R, colOf(far));
            if (!(grid.cands[target] & b)) {
              continue;
            }
            out.push(
              erFinding(grid, digit, box, R, C, spots, near, far, target, ROW_UNIT(row), ROW_UNIT(R)),
            );
          }
        }
      }
    }
  }
  return dedupeByEffect(out);
};

const erFinding = (
  grid: Grid,
  digit: number,
  box: number,
  R: number,
  C: number,
  spots: number[],
  near: number,
  far: number,
  target: number,
  linkUnit: number,
  pushedLine: number,
): Finding => {
  void grid;
  const highlights: Highlight[] = [
    ...spots.map((cell) => ({ cell, digit, tone: 'base' as const })),
    { cell: near, digit, tone: 'on' },
    { cell: far, digit, tone: 'on' },
  ];
  return finding({
    technique: 'empty-rectangle',
    eliminations: [{ cell: target, digit }],
    pattern: [...spots, near, far].sort((m, n) => m - n),
    highlights,
    units: [BOX_UNIT(box), linkUnit, pushedLine],
    links: [{ from: { cell: near, digit }, to: { cell: far, digit }, strong: true }],
    digit,
    text: `In box ${box + 1}, every ${digit} lies in row ${R + 1} or column ${C + 1}. ${capital(unitName(linkUnit))} has ${digit} only at ${cellName(near)} and ${cellName(far)}. If ${cellName(near)} is ${digit}, box ${box + 1} loses its options in ${unitName(pushedLine === ROW_UNIT(R) ? COL_UNIT(C) : ROW_UNIT(R))} and its ${digit} is pushed into ${unitName(pushedLine)}, which rules out ${cellName(target)}. If instead ${cellName(far)} is ${digit}, it sees ${cellName(target)} directly. Either way, remove ${digit} from ${cellName(target)}.`,
  });
};

export const simpleColoring = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (let digit = 1; digit <= 9; digit += 1) {
    const links = strongLinks(grid, digit);
    const adjacency = new Map<number, number[]>();
    const linkUnits = new Map<string, number>();
    for (const [unit, a, b] of links) {
      adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
      adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
      linkUnits.set(`${Math.min(a, b)}-${Math.max(a, b)}`, unit);
    }
    const colour = new Map<number, number>();
    for (const start of adjacency.keys()) {
      if (colour.has(start)) {
        continue;
      }
      const component: number[] = [];
      const queue = [start];
      colour.set(start, 0);
      let bipartite = true;
      while (queue.length > 0) {
        const cell = queue.shift() as number;
        component.push(cell);
        for (const next of adjacency.get(cell) ?? []) {
          if (!colour.has(next)) {
            colour.set(next, 1 - (colour.get(cell) as number));
            queue.push(next);
          } else if (colour.get(next) === colour.get(cell)) {
            bipartite = false;
          }
        }
      }
      if (!bipartite || component.length < 3) {
        continue;
      }
      const edges: Link[] = [];
      for (const cell of component) {
        for (const next of adjacency.get(cell) ?? []) {
          if (cell < next) {
            edges.push({ from: { cell, digit }, to: { cell: next, digit }, strong: true });
          }
        }
      }
      const highlights: Highlight[] = component.map((cell) => ({
        cell,
        digit,
        tone: colour.get(cell) === 0 ? 'on' : 'off',
      }));
      const groups = [component.filter((c) => colour.get(c) === 0), component.filter((c) => colour.get(c) === 1)];
      const pattern = [...component].sort((m, n) => m - n);

      // Colour wrap: two cells of one colour see each other, so that colour is false.
      for (const side of [0, 1]) {
        const group = groups[side];
        let clash: [number, number] | null = null;
        for (let i = 0; i < group.length && !clash; i += 1) {
          for (let j = i + 1; j < group.length; j += 1) {
            if (sees(group[i], group[j])) {
              clash = [group[i], group[j]];
              break;
            }
          }
        }
        if (!clash) {
          continue;
        }
        const eliminations = group.map((cell) => ({ cell, digit })).sort((m, n) => m.cell - n.cell);
        out.push(
          finding({
            technique: 'simple-coloring',
            eliminations,
            pattern,
            highlights,
            links: edges,
            digit,
            text: `Join every pair of cells where ${digit} is forced into one of two places, and colour along the chain in two alternating shades. Exactly one shade is the true ${digit}. Two cells of the same shade, ${cellName(clash[0])} and ${cellName(clash[1])}, see each other, so they can't both be ${digit}. That shade is false everywhere. Remove ${describeCandidates(eliminations)}.`,
          }),
        );
      }

      // Colour trap: an outside cell that sees both colours.
      const eliminations: Candidate[] = [];
      for (let cell = 0; cell < 81; cell += 1) {
        if (colour.has(cell) && component.includes(cell)) {
          continue;
        }
        if (!(grid.cands[cell] & bit(digit))) {
          continue;
        }
        if (groups[0].some((c) => sees(c, cell)) && groups[1].some((c) => sees(c, cell))) {
          eliminations.push({ cell, digit });
        }
      }
      if (eliminations.length > 0) {
        out.push(
          finding({
            technique: 'simple-coloring',
            eliminations,
            pattern,
            highlights,
            links: edges,
            digit,
            text: `Join every pair of cells where ${digit} is forced into one of two places, and colour along the chain in two alternating shades. Exactly one shade is the true ${digit}, though you don't yet know which. A cell that sees both shades can't be ${digit} either way. Remove ${describeCandidates(eliminations)}.`,
          }),
        );
      }
    }
  }
  return dedupe(out);
};

const MAX_CHAIN_LINKS = 13;

/** Alternating strong/weak chains on one digit, starting and ending strong. */
export const xChain = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  for (let digit = 1; digit <= 9; digit += 1) {
    const b = bit(digit);
    const nodes: number[] = [];
    for (let cell = 0; cell < 81; cell += 1) {
      if (grid.cands[cell] & b) {
        nodes.push(cell);
      }
    }
    const strong = new Map<number, number[]>();
    for (const [, a, c] of strongLinks(grid, digit)) {
      strong.set(a, [...new Set([...(strong.get(a) ?? []), c])]);
      strong.set(c, [...new Set([...(strong.get(c) ?? []), a])]);
    }
    const weak = new Map<number, number[]>();
    for (const cell of nodes) {
      weak.set(
        cell,
        nodes.filter((other) => other !== cell && sees(other, cell)),
      );
    }
    for (const start of strong.keys()) {
      // state = cell * 2 + (next link must be strong ? 0 : 1)
      const parent = new Map<number, number>();
      const depth = new Map<number, number>();
      const first = start * 2;
      parent.set(first, -1);
      depth.set(first, 0);
      const queue = [first];
      while (queue.length > 0) {
        const state = queue.shift() as number;
        const cell = state >> 1;
        const needStrong = (state & 1) === 0;
        const d = depth.get(state) as number;
        if (d >= MAX_CHAIN_LINKS) {
          continue;
        }
        const nextCells = needStrong ? strong.get(cell) ?? [] : weak.get(cell) ?? [];
        for (const next of nextCells) {
          const ns = next * 2 + (needStrong ? 1 : 0);
          if (parent.has(ns)) {
            continue;
          }
          parent.set(ns, state);
          depth.set(ns, d + 1);
          queue.push(ns);
          if (needStrong && next !== start && d + 1 >= 3) {
            const path = tracePath(parent, ns);
            if (new Set(path).size !== path.length) {
              continue;
            }
            const eliminations = eliminateSeeingBoth(grid, start, next, digit, path);
            if (eliminations.length === 0) {
              continue;
            }
            const linksList: Link[] = [];
            for (let k = 0; k + 1 < path.length; k += 1) {
              linksList.push({ from: { cell: path[k], digit }, to: { cell: path[k + 1], digit }, strong: k % 2 === 0 });
            }
            out.push(
              finding({
                technique: 'x-chain',
                eliminations,
                pattern: [...path].sort((m, n) => m - n),
                highlights: path.map((cell, k) => ({ cell, digit, tone: k % 2 === 0 ? 'off' : 'on' })),
                links: linksList,
                digit,
                text: `Follow ${digit} along the chain ${path.map(cellName).map((name, k) => (k === 0 ? name : `${k % 2 === 1 ? ' = ' : ' − '}${name}`)).join('')}. A strong link (=) means at least one end is ${digit}; a weak link (−) means the two ends can't both be. If ${cellName(start)} isn't ${digit}, the links force ${cellName(next)} to be ${digit}. So one of the two ends is ${digit}, and a cell that sees both can't be. Remove ${describeCandidates(eliminations)}.`,
              }),
            );
          }
        }
      }
    }
  }
  return dedupeByEffect(out.sort((a, b2) => a.links.length - b2.links.length)).slice(0, 40);
};

const tracePath = (parent: Map<number, number>, end: number): number[] => {
  const path: number[] = [];
  let state = end;
  while (state !== -1) {
    path.push(state >> 1);
    state = parent.get(state) as number;
  }
  return path.reverse();
};

