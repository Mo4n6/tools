// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import { describe, expect, it } from 'vitest';

import bank from './data/positions.json';
import { createDrill, judge, matchPattern, type Bank } from './drill';
import { TECHNIQUES, techniqueById } from './engine/catalog';
import { createRng } from './engine/random';
import type { TechniqueId } from './engine/types';
import {
  MASTERY_NEEDED,
  TEST_PASS,
  emptyProgress,
  isMastered,
  isTestUnlocked,
  isUnlocked,
  parseProgress,
  withResult,
  withTest,
} from './progress';

const positions = bank.positions as Bank;

describe('judging answers', () => {
  it.each(TECHNIQUES.map((t) => t.id))('accepts the move a %s drill teaches', (id) => {
    const drill = createDrill(positions, id, createRng(id.length), []);
    expect(drill.findings.length).toBeGreaterThan(0);
    const target = drill.findings[0];
    const verdict = judge(drill, { placements: target.placements, eliminations: target.eliminations });
    expect(verdict.kind).toBe('correct');
    if (techniqueById(id).patternStep) {
      expect(matchPattern(drill, target.pattern).length).toBeGreaterThan(0);
    }
  });

  it('accepts a partial answer and says what was left', () => {
    const drill = createDrill(positions, 'x-wing', createRng(3), []);
    const target = drill.findings.find((f) => f.eliminations.length > 1);
    if (!target) {
      return;
    }
    const verdict = judge(drill, { placements: [], eliminations: target.eliminations.slice(0, 1) });
    expect(verdict.kind).toBe('correct');
    expect(verdict.kind === 'correct' && verdict.missing.length).toBeGreaterThan(0);
  });

  it('holds the marks to the pattern the player selected', () => {
    const rng = createRng(17);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const drill = createDrill(positions, 'pointing', rng, []);
      const [a, b] = drill.findings;
      if (!a || !b) {
        continue;
      }
      const onlyB = b.eliminations.filter((e) => !a.eliminations.some((x) => x.cell === e.cell && x.digit === e.digit));
      if (onlyB.length === 0) {
        continue;
      }
      const answer = { placements: [], eliminations: onlyB };
      expect(judge(drill, answer, { restrictTo: [a] }).kind).toBe('elsewhere');
      expect(judge(drill, answer, { restrictTo: [b] }).kind).toBe('correct');
      expect(judge(drill, answer).kind).toBe('correct');
      return;
    }
    throw new Error('no Pointing drill with two separate instances in 40 draws');
  });

  it('flags a mark that contradicts the solution', () => {
    const drill = createDrill(positions, 'naked-pair', createRng(5), []);
    const cell = drill.grid.values.findIndex((v) => v === 0);
    const verdict = judge(drill, { placements: [], eliminations: [{ cell, digit: drill.solution[cell] }] });
    expect(verdict.kind).toBe('wrong');
  });

  it('says so when a true mark comes from a different technique', () => {
    // A true elimination that Pointing doesn't explain must not be scored as
    // Pointing, however it was guessed.
    const rng = createRng(11);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const drill = createDrill(positions, 'pointing', rng, []);
      const explained = new Set(drill.findings.flatMap((f) => f.eliminations.map((e) => `${e.cell}:${e.digit}`)));
      const cell = drill.grid.values.findIndex(
        (v, i) =>
          v === 0 &&
          [1, 2, 3, 4, 5, 6, 7, 8, 9].some(
            (d) => d !== drill.solution[i] && drill.grid.cands[i] & (1 << (d - 1)) && !explained.has(`${i}:${d}`),
          ),
      );
      if (cell < 0) {
        continue;
      }
      const digit = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(
        (d) => d !== drill.solution[cell] && drill.grid.cands[cell] & (1 << (d - 1)) && !explained.has(`${cell}:${d}`),
      ) as number;
      expect(judge(drill, { placements: [], eliminations: [{ cell, digit }] }).kind).toBe('other');
      return;
    }
  });

  it('avoids positions seen recently', () => {
    const recent = positions['x-wing'].map((_, i) => i).slice(1);
    const drill = createDrill(positions, 'x-wing', createRng(9), recent);
    expect(recent.slice(-24)).not.toContain(drill.index);
  });
});

describe('progress', () => {
  const master = (id: TechniqueId, p = emptyProgress()) => {
    let next = p;
    for (let i = 0; i < MASTERY_NEEDED; i += 1) {
      next = withResult(next, id, true);
    }
    return next;
  };

  it('opens the course at the first technique only', () => {
    const p = emptyProgress();
    expect(isUnlocked(p, 'full-house')).toBe(true);
    expect(isUnlocked(p, 'hidden-single')).toBe(false);
    expect(isUnlocked(p, 'pointing')).toBe(false);
  });

  it('unlocks the next technique on mastery, and keeps it unlocked', () => {
    let p = master('full-house');
    expect(isMastered(p, 'full-house')).toBe(true);
    expect(isUnlocked(p, 'hidden-single')).toBe(true);
    for (let i = 0; i < 6; i += 1) {
      p = withResult(p, 'full-house', false);
    }
    expect(isUnlocked(p, 'hidden-single')).toBe(true);
  });

  it('opens the next tier only after its test is passed', () => {
    let p = master('naked-single', master('hidden-single', master('full-house')));
    expect(isTestUnlocked(p, 1)).toBe(true);
    expect(isUnlocked(p, 'pointing')).toBe(false);
    p = withTest(p, 1, TEST_PASS - 1);
    expect(isUnlocked(p, 'pointing')).toBe(false);
    p = withTest(p, 1, TEST_PASS);
    expect(isUnlocked(p, 'pointing')).toBe(true);
  });

  it('survives a round trip through storage and ignores junk', () => {
    const p = withTest(master('full-house'), 1, 9);
    expect(parseProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(parseProgress({ version: 1, techniques: { nope: { results: [true] } }, tests: { 99: { best: 3 } } })).toEqual(
      emptyProgress(),
    );
    expect(parseProgress('garbage')).toEqual(emptyProgress());
  });
});
