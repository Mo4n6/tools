// Girih — the human-style solver: find the simplest move, apply it.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import { TECHNIQUES, TECHNIQUE_INDEX } from './catalog.ts';
import { eliminate, place, type Grid } from './grid.ts';
import type { Finding, TechniqueId } from './types.ts';

export type Step = { technique: TechniqueId; findings: Finding[] };

/**
 * The first technique in curriculum order that makes progress, with all of
 * its findings. Pass `through` to stop looking after that technique.
 */
export const simplestStep = (grid: Grid, through?: TechniqueId): Step | null => {
  const last = through === undefined ? TECHNIQUES.length - 1 : (TECHNIQUE_INDEX.get(through) as number);
  for (let i = 0; i <= last; i += 1) {
    const findings = TECHNIQUES[i].detect(grid);
    if (findings.length > 0) {
      return { technique: TECHNIQUES[i].id, findings };
    }
  }
  return null;
};

export const applyFinding = (grid: Grid, item: Finding): void => {
  for (const { cell, digit } of item.placements) {
    place(grid, cell, digit);
  }
  for (const { cell, digit } of item.eliminations) {
    eliminate(grid, cell, digit);
  }
};

export const isSolved = (grid: Grid): boolean => grid.values.every((v) => v !== 0);
