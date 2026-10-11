// Girih — the course outline, with what's unlocked and mastered.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import { TIERS, techniquesInTier } from '../engine/catalog';
import type { TechniqueId } from '../engine/types';
import {
  MASTERY_WINDOW,
  TEST_LENGTH,
  isMastered,
  isTestPassed,
  isTestUnlocked,
  isUnlocked,
  type Progress,
} from '../progress';

export type View =
  | { kind: 'technique'; id: TechniqueId; tab: 'learn' | 'practice' }
  | { kind: 'review' }
  | { kind: 'test'; tier: number };

type CurriculumProps = {
  progress: Progress;
  view: View;
  onOpen: (view: View) => void;
};

const Dots = ({ results }: { results: boolean[] }): JSX.Element => {
  const recent = results.slice(-MASTERY_WINDOW);
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {Array.from({ length: MASTERY_WINDOW }, (_, i) => {
        const value = recent[i];
        return (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${
              value === undefined ? 'bg-emerald-500/20' : value ? 'bg-emerald-300' : 'bg-rose-400/80'
            }`}
          />
        );
      })}
    </span>
  );
};

const Curriculum = ({ progress, view, onOpen }: CurriculumProps): JSX.Element => (
  <nav aria-label="Girih curriculum" className="space-y-4">
    {TIERS.map((tier) => {
      const testOpen = isTestUnlocked(progress, tier.id);
      const test = progress.tests[tier.id];
      const testActive = view.kind === 'test' && view.tier === tier.id;
      return (
        <section key={tier.id}>
          <h3 className="text-xs uppercase tracking-wide text-emerald-300/70">
            {tier.id}. {tier.name}
          </h3>
          <ul className="mt-1 space-y-1">
            {techniquesInTier(tier.id).map((tech) => {
              const open = isUnlocked(progress, tech.id);
              const mastered = isMastered(progress, tech.id);
              const active = view.kind === 'technique' && view.id === tech.id;
              const results = progress.techniques[tech.id]?.results ?? [];
              return (
                <li key={tech.id}>
                  <button
                    type="button"
                    disabled={!open}
                    onClick={() =>
                      onOpen({
                        kind: 'technique',
                        id: tech.id,
                        tab: progress.techniques[tech.id]?.sawLesson ? 'practice' : 'learn',
                      })
                    }
                    aria-current={active ? 'page' : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-sm transition ${
                      active
                        ? 'border-emerald-300/80 bg-emerald-500/15 text-emerald-50'
                        : open
                          ? 'border-emerald-500/20 bg-[#0a160f] text-emerald-100/90 hover:border-emerald-400/50'
                          : 'cursor-not-allowed border-transparent text-emerald-300/40'
                    }`}
                  >
                    <span className="truncate">
                      {mastered ? <span className="mr-1 text-emerald-300" aria-label="mastered">✓</span> : null}
                      {tech.name}
                    </span>
                    {open ? <Dots results={results} /> : <span className="text-xs">locked</span>}
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                disabled={!testOpen}
                onClick={() => onOpen({ kind: 'test', tier: tier.id })}
                aria-current={testActive ? 'page' : undefined}
                className={`flex w-full items-center justify-between gap-2 rounded-md border border-dashed px-2 py-1 text-left text-sm ${
                  testActive
                    ? 'border-amber-300/80 bg-amber-500/10 text-amber-50'
                    : testOpen
                      ? 'border-amber-400/40 text-amber-100/90 hover:border-amber-300/70'
                      : 'cursor-not-allowed border-emerald-500/15 text-emerald-300/40'
                }`}
              >
                <span>
                  {isTestPassed(progress, tier.id) ? <span className="mr-1 text-amber-300">✓</span> : null}
                  Tier test
                </span>
                <span className="text-xs">{test ? `best ${test.best}/${TEST_LENGTH}` : testOpen ? 'ready' : 'locked'}</span>
              </button>
            </li>
          </ul>
        </section>
      );
    })}
  </nav>
);

export default Curriculum;
