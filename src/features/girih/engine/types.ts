// Girih — the shape every technique detector reports in.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import type { Candidate, Grid } from './grid.ts';

export type TechniqueId =
  | 'full-house'
  | 'hidden-single'
  | 'naked-single'
  | 'pointing'
  | 'claiming'
  | 'naked-pair'
  | 'hidden-pair'
  | 'naked-triple'
  | 'hidden-triple'
  | 'x-wing'
  | 'xy-wing'
  | 'swordfish'
  | 'xyz-wing'
  | 'skyscraper'
  | 'two-string-kite'
  | 'empty-rectangle'
  | 'w-wing'
  | 'simple-coloring'
  | 'naked-quad'
  | 'hidden-quad'
  | 'jellyfish'
  | 'finned-x-wing'
  | 'finned-swordfish'
  | 'ur-type-1'
  | 'ur-type-2'
  | 'ur-type-4'
  | 'bug-plus-one'
  | 'x-chain'
  | 'xy-chain'
  | 'aic'
  | 'als-xz';

/**
 * How a highlighted candidate is drawn. `base` is the pattern itself, `fin`
 * the extra cells a finned fish or an ALS hinges on, and `on`/`off` the two
 * alternating states along a chain or the two colours in a colouring.
 */
export type Tone = 'base' | 'fin' | 'on' | 'off' | 'alt';

export type Highlight = { cell: number; digit: number; tone: Tone };

export type Link = { from: Candidate; to: Candidate; strong: boolean };

export type Finding = {
  technique: TechniqueId;
  placements: Candidate[];
  eliminations: Candidate[];
  /** Cells a player selects to show they found the pattern. */
  pattern: number[];
  highlights: Highlight[];
  /** Units to tint while explaining; also the first hint. */
  units: number[];
  links: Link[];
  /** A digit the whole pattern is about, when there is one. */
  digit?: number;
  text: string;
};

export type Detector = (grid: Grid) => Finding[];

export const finding = (partial: Omit<Finding, 'highlights' | 'units' | 'links' | 'pattern' | 'placements' | 'eliminations'> & Partial<Finding>): Finding => ({
  placements: [],
  eliminations: [],
  pattern: [],
  highlights: [],
  units: [],
  links: [],
  ...partial,
});

/** Drops findings that repeat an earlier one's pattern and effect. */
export const dedupe = (findings: Finding[]): Finding[] => {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const item of findings) {
    const key = [
      [...item.pattern].sort((a, b) => a - b).join(','),
      item.placements.map((c) => `${c.cell}:${c.digit}`).join(','),
      item.eliminations.map((c) => `${c.cell}:${c.digit}`).join(','),
    ].join('|');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
};

/** Keeps one finding per distinct effect, preferring the earliest (usually shortest). */
export const dedupeByEffect = (findings: Finding[]): Finding[] => {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const item of findings) {
    const key = [
      item.placements.map((c) => `${c.cell}:${c.digit}`).join(','),
      item.eliminations.map((c) => `${c.cell}:${c.digit}`).join(','),
    ].join('|');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
};
