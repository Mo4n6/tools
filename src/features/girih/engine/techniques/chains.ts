// Girih — XY-Chain and Alternating Inference Chains.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Both are proofs of the form "if the first candidate is false, the last one is
// true". Strong links carry false to true, weak links carry true to false, so a
// chain that starts and ends on a strong link proves one end or the other.
// Walking the links in that order is sound even if a walk revisits a cell, but
// only simple chains are reported because only those read clearly.

import {
  MASK_DIGITS,
  POPCOUNT,
  PEERS,
  UNITS,
  bit,
  cellName,
  commonPeers,
  describeCandidates,
  sees,
  type Candidate,
  type Grid,
} from '../grid.ts';
import { dedupeByEffect, finding, type Finding, type Highlight, type Link } from '../types.ts';

const MAX_LINKS = 13;
const MAX_FINDINGS = 40;

export const xyChain = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  const bivalue: number[] = [];
  for (let cell = 0; cell < 81; cell += 1) {
    if (grid.values[cell] === 0 && POPCOUNT[grid.cands[cell]] === 2) {
      bivalue.push(cell);
    }
  }
  const neighbours = new Map<number, number[]>();
  for (const cell of bivalue) {
    neighbours.set(
      cell,
      bivalue.filter((other) => other !== cell && sees(other, cell) && grid.cands[other] & grid.cands[cell]),
    );
  }
  const other = (cell: number, digit: number): number => MASK_DIGITS[grid.cands[cell] & ~bit(digit)][0];

  for (const start of bivalue) {
    for (const z of MASK_DIGITS[grid.cands[start]]) {
      // state = cell * 10 + the digit the cell is forced to
      const parent = new Map<number, number>();
      const depth = new Map<number, number>();
      const first = start * 10 + other(start, z);
      parent.set(first, -1);
      depth.set(first, 1);
      const queue = [first];
      while (queue.length > 0) {
        const state = queue.shift() as number;
        const cell = Math.floor(state / 10);
        const forced = state % 10;
        const length = depth.get(state) as number;
        if (length >= MAX_LINKS) {
          continue;
        }
        for (const next of neighbours.get(cell) ?? []) {
          if (!(grid.cands[next] & bit(forced))) {
            continue;
          }
          const nextForced = other(next, forced);
          const ns = next * 10 + nextForced;
          if (parent.has(ns)) {
            continue;
          }
          parent.set(ns, state);
          depth.set(ns, length + 1);
          queue.push(ns);
          if (nextForced !== z || length + 1 < 3) {
            continue;
          }
          const states: number[] = [];
          for (let s = ns; s !== -1; s = parent.get(s) as number) {
            states.push(s);
          }
          states.reverse();
          const cells = states.map((s) => Math.floor(s / 10));
          if (new Set(cells).size !== cells.length) {
            continue;
          }
          const eliminations = commonPeers([start, next])
            .filter((c) => !cells.includes(c) && grid.cands[c] & bit(z))
            .map((c) => ({ cell: c, digit: z }));
          if (eliminations.length === 0) {
            continue;
          }
          const steps = states.map((s, k) => {
            const c = Math.floor(s / 10);
            const out2 = s % 10;
            const into = k === 0 ? z : other(c, out2);
            return { cell: c, into, out: out2 };
          });
          const highlights: Highlight[] = steps.flatMap(({ cell: c, into, out: o }) => [
            { cell: c, digit: into, tone: 'off' as const },
            { cell: c, digit: o, tone: 'on' as const },
          ]);
          const links: Link[] = [];
          steps.forEach(({ cell: c, into, out: o }, k) => {
            links.push({ from: { cell: c, digit: into }, to: { cell: c, digit: o }, strong: true });
            if (k + 1 < steps.length) {
              links.push({ from: { cell: c, digit: o }, to: { cell: steps[k + 1].cell, digit: o }, strong: false });
            }
          });
          const story = steps
            .slice(1)
            .map(({ cell: c, into, out: o }) => `${cellName(c)} (${into}/${o}) is ${o}`)
            .join(', so ');
          out.push(
            finding({
              technique: 'xy-chain',
              eliminations,
              pattern: [...cells].sort((m, n) => m - n),
              highlights,
              links,
              digit: z,
              text: `Chain the two-candidate cells from ${cellName(start)} to ${cellName(next)}. If ${cellName(start)} isn't ${z}, it is ${steps[0].out}; then ${story}. So either ${cellName(start)} or ${cellName(next)} is ${z}, and any cell that sees both can't be. Remove ${describeCandidates(eliminations)}.`,
            }),
          );
        }
      }
    }
  }
  return dedupeByEffect(out.sort((a, b) => a.pattern.length - b.pattern.length)).slice(0, MAX_FINDINGS);
};

const node = (cell: number, digit: number): number => cell * 9 + (digit - 1);
const cellOfNode = (n: number): number => Math.floor(n / 9);
const digitOfNode = (n: number): number => (n % 9) + 1;
const nodeName = (n: number): string => `(${digitOfNode(n)})${cellName(cellOfNode(n))}`;

export const aic = (grid: Grid): Finding[] => {
  const out: Finding[] = [];
  const strong = new Map<number, Set<number>>();
  const weak = new Map<number, number[]>();
  const addStrong = (a: number, b: number): void => {
    if (!strong.has(a)) {
      strong.set(a, new Set());
    }
    if (!strong.has(b)) {
      strong.set(b, new Set());
    }
    (strong.get(a) as Set<number>).add(b);
    (strong.get(b) as Set<number>).add(a);
  };
  for (let cell = 0; cell < 81; cell += 1) {
    if (grid.values[cell] === 0 && POPCOUNT[grid.cands[cell]] === 2) {
      const [a, b] = MASK_DIGITS[grid.cands[cell]];
      addStrong(node(cell, a), node(cell, b));
    }
  }
  for (let unit = 0; unit < 27; unit += 1) {
    for (let digit = 1; digit <= 9; digit += 1) {
      const spots = UNITS[unit].filter((cell) => grid.cands[cell] & bit(digit));
      if (spots.length === 2) {
        addStrong(node(spots[0], digit), node(spots[1], digit));
      }
    }
  }
  for (let cell = 0; cell < 81; cell += 1) {
    for (const digit of MASK_DIGITS[grid.cands[cell]]) {
      const list: number[] = [];
      for (const d of MASK_DIGITS[grid.cands[cell]]) {
        if (d !== digit) {
          list.push(node(cell, d));
        }
      }
      for (const peer of PEERS[cell]) {
        if (grid.cands[peer] & bit(digit)) {
          list.push(node(peer, digit));
        }
      }
      weak.set(node(cell, digit), list);
    }
  }

  for (const start of strong.keys()) {
    // state = node * 2 + (next link must be strong ? 0 : 1)
    const parent = new Map<number, number>();
    const depth = new Map<number, number>();
    parent.set(start * 2, -1);
    depth.set(start * 2, 0);
    const queue = [start * 2];
    while (queue.length > 0) {
      const state = queue.shift() as number;
      const current = state >> 1;
      const needStrong = (state & 1) === 0;
      const d = depth.get(state) as number;
      if (d >= MAX_LINKS) {
        continue;
      }
      const nexts = needStrong ? [...(strong.get(current) ?? [])] : weak.get(current) ?? [];
      for (const next of nexts) {
        const ns = next * 2 + (needStrong ? 1 : 0);
        if (parent.has(ns)) {
          continue;
        }
        parent.set(ns, state);
        depth.set(ns, d + 1);
        queue.push(ns);
        if (!needStrong || next === start || d + 1 < 3) {
          continue;
        }
        const path: number[] = [];
        for (let s = ns; s !== -1; s = parent.get(s) as number) {
          path.push(s >> 1);
        }
        path.reverse();
        if (new Set(path).size !== path.length) {
          continue;
        }
        const eliminations = aicEliminations(grid, start, next, path);
        if (eliminations.length === 0) {
          continue;
        }
        const links: Link[] = [];
        for (let k = 0; k + 1 < path.length; k += 1) {
          links.push({
            from: { cell: cellOfNode(path[k]), digit: digitOfNode(path[k]) },
            to: { cell: cellOfNode(path[k + 1]), digit: digitOfNode(path[k + 1]) },
            strong: k % 2 === 0,
          });
        }
        const notation = path.map((n, k) => (k === 0 ? nodeName(n) : `${k % 2 === 1 ? ' = ' : ' − '}${nodeName(n)}`)).join('');
        out.push(
          finding({
            technique: 'aic',
            eliminations,
            pattern: [...new Set(path.map(cellOfNode))].sort((m, n) => m - n),
            highlights: path.map((n, k) => ({
              cell: cellOfNode(n),
              digit: digitOfNode(n),
              tone: k % 2 === 0 ? 'off' : 'on',
            })),
            links,
            text: `Alternating chain: ${notation}. A strong link (=) means at least one end is true; a weak link (−) means the two ends can't both be true, whether they are the same digit in two cells that see each other or two digits in one cell. If ${nodeName(start)} is false, the chain forces ${nodeName(next)} true, so at least one of the two ends is true. ${aicConclusion(start, next, eliminations)} Remove ${describeCandidates(eliminations)}.`,
          }),
        );
      }
    }
  }
  return dedupeByEffect(out.sort((a, b) => a.links.length - b.links.length)).slice(0, MAX_FINDINGS);
};

const aicEliminations = (grid: Grid, start: number, end: number, path: number[]): Candidate[] => {
  const c1 = cellOfNode(start);
  const c2 = cellOfNode(end);
  const d1 = digitOfNode(start);
  const d2 = digitOfNode(end);
  const onPath = new Set(path);
  const out: Candidate[] = [];
  if (c1 === c2) {
    if (d1 === d2) {
      return [];
    }
    for (const digit of MASK_DIGITS[grid.cands[c1]]) {
      if (digit !== d1 && digit !== d2) {
        out.push({ cell: c1, digit });
      }
    }
    return out;
  }
  if (d1 === d2) {
    for (const cell of commonPeers([c1, c2])) {
      if (grid.cands[cell] & bit(d1) && !onPath.has(node(cell, d1))) {
        out.push({ cell, digit: d1 });
      }
    }
    return out;
  }
  if (sees(c1, c2)) {
    if (grid.cands[c1] & bit(d2) && !onPath.has(node(c1, d2))) {
      out.push({ cell: c1, digit: d2 });
    }
    if (grid.cands[c2] & bit(d1) && !onPath.has(node(c2, d1))) {
      out.push({ cell: c2, digit: d1 });
    }
  }
  return out.sort((a, b) => a.cell - b.cell);
};

const aicConclusion = (start: number, end: number, eliminations: Candidate[]): string => {
  const c1 = cellOfNode(start);
  const c2 = cellOfNode(end);
  const d1 = digitOfNode(start);
  const d2 = digitOfNode(end);
  if (c1 === c2) {
    return `Both ends are in ${cellName(c1)}, so it must be ${d1} or ${d2} and nothing else.`;
  }
  if (d1 === d2) {
    return `Both ends are ${d1}, so a cell that sees ${cellName(c1)} and ${cellName(c2)} can't be ${d1}.`;
  }
  // The two ends see each other with different digits; explain one of the
  // eliminations, the other is the same argument mirrored.
  const shown = eliminations[0];
  const [cell, digit, otherCell, otherDigit] =
    shown && shown.cell === c2 ? [c2, d1, c1, d2] : [c1, d2, c2, d1];
  return `${cellName(c1)} and ${cellName(c2)} see each other. If ${cellName(cell)} were ${digit}, it couldn't also be ${otherDigit}, and ${cellName(otherCell)} couldn't be ${digit} — both ends false, which the chain forbids.`;
};
