// Girih — learn sudoku techniques one move at a time.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
//
// Girih is the Persian art of interlaced geometric tilework, read by finding
// the pattern in the grid. That is the skill this trains: every board is
// frozen at the moment one technique is the simplest way forward. Find it,
// apply it, move on. Boards come from a mined bank (scripts/girih/mine.ts),
// disguised by a random symmetry on every draw. Nothing leaves the browser.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Curriculum, { type View } from './components/Curriculum';
import DrillView, { buttonClass, primaryButtonClass } from './components/DrillView';
import LessonView from './components/LessonView';
import { LESSONS } from './content/lessons';
import { createDrill, type Bank, type Drill } from './drill';
import { TECHNIQUES, TIERS, techniqueById, techniquesInTier } from './engine/catalog';
import { createRng, pick, shuffle } from './engine/random';
import type { TechniqueId } from './engine/types';
import {
  MASTERY_NEEDED,
  MASTERY_WINDOW,
  TEST_LENGTH,
  TEST_PASS,
  emptyProgress,
  isMastered,
  isTestUnlocked,
  isUnlocked,
  loadProgress,
  masteryCount,
  nextTechnique,
  reviewPool,
  saveProgress,
  withLessonSeen,
  withRecent,
  withResult,
  withTest,
  type Progress,
} from './progress';

type TestSession = { tier: number; questions: TechniqueId[]; results: boolean[]; index: number };

const buildTest = (tier: number, rng: () => number): TechniqueId[] => {
  const current = techniquesInTier(tier).map((t) => t.id);
  const earlier = TECHNIQUES.filter((t) => t.tier < tier).map((t) => t.id);
  const questions = [...current];
  while (questions.length < TEST_LENGTH) {
    questions.push(earlier.length > 0 && rng() < 0.4 ? pick(rng, earlier) : pick(rng, current));
  }
  return shuffle(rng, questions);
};

const Ornament = (): JSX.Element => (
  <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden="true">
    <g fill="none" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="9" y="9" width="22" height="22" stroke="#22d3ee" />
      <rect x="9" y="9" width="22" height="22" stroke="#6ee7b7" transform="rotate(45 20 20)" />
      <circle cx="20" cy="20" r="4.5" stroke="#fcd34d" />
    </g>
  </svg>
);

const GirihApp = (): JSX.Element => {
  const [bank, setBank] = useState<Bank | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [view, setView] = useState<View>(() => {
    const id = nextTechnique(progress);
    return { kind: 'technique', id, tab: progress.techniques[id]?.sawLesson ? 'practice' : 'learn' };
  });
  const [drill, setDrill] = useState<Drill | null>(null);
  const [drillSerial, setDrillSerial] = useState(0);
  const [test, setTest] = useState<TestSession | null>(null);
  const [review, setReview] = useState({ done: 0, correct: 0 });
  const [justMastered, setJustMastered] = useState<TechniqueId | null>(null);
  const rngRef = useRef(createRng((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0));
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    let cancelled = false;
    import('./data/positions.json')
      .then((module) => {
        if (!cancelled) {
          setBank(module.default.positions as Bank);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const drawDrill = useCallback(
    (technique: TechniqueId): void => {
      if (!bank) {
        return;
      }
      try {
        const next = createDrill(bank, technique, rngRef.current, progressRef.current.recent[technique] ?? []);
        setProgress((p) => withRecent(p, technique, next.index));
        setDrill(next);
        setDrillSerial((n) => n + 1);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    },
    [bank],
  );

  const drawReview = useCallback((): void => {
    const pool = reviewPool(progressRef.current);
    if (pool.length > 0) {
      drawDrill(pick(rngRef.current, pool));
    } else {
      setDrill(null);
    }
  }, [drawDrill]);

  // A fresh board whenever the view changes.
  useEffect(() => {
    if (!bank) {
      return;
    }
    setJustMastered(null);
    if (view.kind === 'technique') {
      drawDrill(view.id);
    } else if (view.kind === 'review') {
      setReview({ done: 0, correct: 0 });
      drawReview();
    } else {
      const questions = buildTest(view.tier, rngRef.current);
      setTest({ tier: view.tier, questions, results: [], index: 0 });
      drawDrill(questions[0]);
    }
  }, [bank, view]);

  useEffect(() => {
    if (view.kind === 'technique' && view.tab === 'learn') {
      setProgress((p) => withLessonSeen(p, view.id));
    }
  }, [view]);

  const open = (next: View): void => {
    setView(next);
    setTest(null);
  };

  const onPracticeResolved = (id: TechniqueId, clean: boolean): void => {
    const before = isMastered(progressRef.current, id);
    const after = withResult(progressRef.current, id, clean);
    setProgress(after);
    if (!before && isMastered(after, id)) {
      setJustMastered(id);
    }
  };

  const unlockAll = (value: boolean): void => setProgress((p) => ({ ...p, unlockAll: value }));

  const reset = (): void => {
    if (window.confirm('Reset all Girih progress in this browser?')) {
      const fresh = emptyProgress();
      setProgress(fresh);
      open({ kind: 'technique', id: TECHNIQUES[0].id, tab: 'learn' });
    }
  };

  const header = (
    <header className="flex items-start gap-3">
      <Ornament />
      <div>
        <h2 className="text-xl font-semibold text-emerald-100">Girih</h2>
        <p className="mt-1 max-w-3xl text-sm text-emerald-300/80">
          Learn sudoku techniques, not sudoku. Every board is frozen at the moment one technique is the simplest way forward:
          find it, apply it, move on. {TECHNIQUES.length} techniques in {TIERS.length} tiers, from Full House to ALS-XZ.
        </p>
      </div>
    </header>
  );

  const content = ((): JSX.Element => {
    if (loadError) {
      return <p className="text-sm text-rose-200">Couldn't load the board bank: {loadError}</p>;
    }
    if (!bank) {
      return <p className="text-sm text-emerald-300/80">Loading boards…</p>;
    }

    if (view.kind === 'technique') {
      const tech = techniqueById(view.id);
      const count = masteryCount(progress, view.id);
      const mastered = isMastered(progress, view.id);
      const tabs = (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-emerald-50">
              {tech.name} <span className="text-sm font-normal text-emerald-300/70">· tier {tech.tier}</span>
            </h3>
            <p className="text-xs text-emerald-300/70">
              {mastered
                ? 'Mastered.'
                : `${count} of the last ${MASTERY_WINDOW} drills clean; ${MASTERY_NEEDED} masters it.`}{' '}
              {LESSONS[view.id].summary}
            </p>
          </div>
          <div className="flex overflow-hidden rounded-md border border-emerald-500/40 text-sm" role="tablist">
            {(['learn', 'practice'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={view.tab === tab}
                onClick={() => setView({ ...view, tab })}
                className={`px-3 py-1.5 ${view.tab === tab ? 'bg-emerald-500/25 text-emerald-50' : 'bg-[#0a160f] text-emerald-300/80'}`}
              >
                {tab === 'learn' ? 'Learn' : 'Practice'}
              </button>
            ))}
          </div>
        </div>
      );
      if (!drill || drill.technique !== view.id) {
        return (
          <div className="space-y-4">
            {tabs}
            <p className="text-sm text-emerald-300/80">Drawing a board…</p>
          </div>
        );
      }
      if (view.tab === 'learn') {
        return (
          <div className="space-y-4">
            {tabs}
            <LessonView
              key={`lesson-${drillSerial}`}
              drill={drill}
              onAnotherExample={() => drawDrill(view.id)}
              onPractice={() => setView({ ...view, tab: 'practice' })}
            />
          </div>
        );
      }
      const followUp = justMastered === view.id ? masteredFollowUp(view.id, progress) : null;
      return (
        <div className="space-y-4">
          {tabs}
          {followUp ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-50">
              <span>{followUp.text}</span>
              {followUp.view ? (
                <button type="button" className={primaryButtonClass} onClick={() => open(followUp.view as View)}>
                  {followUp.label}
                </button>
              ) : null}
            </div>
          ) : null}
          <DrillView
            key={`drill-${drillSerial}`}
            drill={drill}
            mode="practice"
            onResolved={({ clean }) => onPracticeResolved(view.id, clean)}
            onNext={() => drawDrill(view.id)}
          />
        </div>
      );
    }

    if (view.kind === 'review') {
      const pool = reviewPool(progress);
      return (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-emerald-50">Mixed review</h3>
            <p className="text-xs text-emerald-300/70">
              Boards from every technique you've mastered, unnamed. Recognising which one applies is the real skill.
              {review.done > 0 ? ` This session: ${review.correct} of ${review.done} clean.` : ''}
            </p>
          </div>
          {pool.length === 0 || !drill ? (
            <p className="text-sm text-emerald-300/80">Master a technique first, and it will start turning up here.</p>
          ) : (
            <DrillView
              key={`review-${drillSerial}`}
              drill={drill}
              mode="recognize"
              onResolved={({ clean }) => setReview((r) => ({ done: r.done + 1, correct: r.correct + (clean ? 1 : 0) }))}
              onNext={drawReview}
            />
          )}
        </div>
      );
    }

    const tier = TIERS[view.tier - 1];
    if (!test || !drill) {
      return <p className="text-sm text-emerald-300/80">Preparing the test…</p>;
    }
    const finished = test.results.length >= TEST_LENGTH && test.index >= TEST_LENGTH;
    const score = test.results.filter(Boolean).length;
    if (finished) {
      const passed = score >= TEST_PASS;
      const nextTier = TIERS[view.tier];
      return (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-emerald-50">
            Tier {tier.id} test: {score}/{TEST_LENGTH}
          </h3>
          <p className="text-sm text-emerald-100/90">
            {passed
              ? nextTier
                ? `Passed. Tier ${nextTier.id}, ${nextTier.name}, is open.`
                : 'Passed. That is the whole course.'
              : `${TEST_PASS} clean answers pass. Review the ones you missed and try again.`}
          </p>
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {test.questions.map((id, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={test.results[i] ? 'text-emerald-300' : 'text-rose-300'}>{test.results[i] ? '✓' : '✗'}</span>
                <button
                  type="button"
                  className="text-left text-emerald-100 underline decoration-emerald-500/40 underline-offset-2 hover:decoration-emerald-300 disabled:no-underline"
                  disabled={!isUnlocked(progress, id)}
                  onClick={() => open({ kind: 'technique', id, tab: 'practice' })}
                >
                  {techniqueById(id).name}
                </button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={() => open({ kind: 'test', tier: tier.id })}>
              Retake
            </button>
            {passed && nextTier ? (
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => open({ kind: 'technique', id: techniquesInTier(nextTier.id)[0].id, tab: 'learn' })}
              >
                Start {nextTier.name}
              </button>
            ) : null}
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-emerald-50">
            Tier {tier.id} test · {tier.name}
          </h3>
          <p className="text-xs text-emerald-300/70">
            Question {Math.min(test.index + 1, TEST_LENGTH)} of {TEST_LENGTH} · {score} clean so far · {TEST_PASS} to pass. The
            technique isn't named: find the simplest move. Hints count against you.
          </p>
        </div>
        <DrillView
          key={`test-${drillSerial}`}
          drill={drill}
          mode="recognize"
          nextLabel={test.index + 1 >= TEST_LENGTH ? 'See results' : 'Next question'}
          onResolved={({ clean }) => {
            setTest((t) => (t ? { ...t, results: [...t.results, clean] } : t));
            if (test.results.length + 1 >= TEST_LENGTH) {
              const final = test.results.filter(Boolean).length + (clean ? 1 : 0);
              setProgress((p) => withTest(p, test.tier, final));
            }
          }}
          onNext={() => {
            const nextIndex = test.index + 1;
            if (test.results.length <= test.index) {
              // Skipped without answering: count it as missed.
              setTest({ ...test, results: [...test.results, false], index: nextIndex });
            } else {
              setTest({ ...test, index: nextIndex });
            }
            if (nextIndex < TEST_LENGTH) {
              drawDrill(test.questions[nextIndex]);
            }
          }}
        />
      </div>
    );
  })();

  const reviewOpen = reviewPool(progress).length > 0;
  const sidebar = (
    <div className="space-y-4">
      <button
        type="button"
        className={`${view.kind === 'review' ? primaryButtonClass : buttonClass} w-full`}
        onClick={() => open({ kind: 'review' })}
        disabled={!reviewOpen}
      >
        Mixed review
      </button>
      <Curriculum progress={progress} view={view} onOpen={open} />
      <div className="space-y-2 border-t border-emerald-500/20 pt-3 text-xs text-emerald-300/80">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="accent-emerald-400"
            checked={progress.unlockAll}
            onChange={(event) => unlockAll(event.target.checked)}
          />
          Unlock everything
        </label>
        <button type="button" className="underline decoration-emerald-500/40 underline-offset-2 hover:text-emerald-100" onClick={reset}>
          Reset progress
        </button>
        <p>Progress is kept in this browser only.</p>
      </div>
    </div>
  );

  const currentLabel = useMemo(() => {
    if (view.kind === 'technique') {
      return techniqueById(view.id).name;
    }
    return view.kind === 'review' ? 'Mixed review' : `Tier ${view.tier} test`;
  }, [view]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 font-sans">
      {header}
      <details className="rounded-md border border-emerald-500/30 bg-[#07110a] p-3 lg:hidden">
        <summary className="cursor-pointer text-sm text-emerald-100">Course · {currentLabel}</summary>
        <div className="mt-3">{sidebar}</div>
      </details>
      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">{sidebar}</aside>
        <section className="min-w-0 rounded-xl border border-emerald-500/30 bg-[#07110a] p-2 shadow-lg shadow-black/20 sm:p-4">{content}</section>
      </div>
    </div>
  );
};

const masteredFollowUp = (id: TechniqueId, progress: Progress): { text: string; label: string; view: View | null } => {
  const tech = techniqueById(id);
  const tierTechs = techniquesInTier(tech.tier);
  const next = tierTechs[tierTechs.findIndex((t) => t.id === id) + 1];
  if (next) {
    return {
      text: `${tech.name} mastered. ${next.name} is unlocked.`,
      label: `Learn ${next.name}`,
      view: { kind: 'technique', id: next.id, tab: 'learn' },
    };
  }
  if (isTestUnlocked(progress, tech.tier)) {
    return {
      text: `${tech.name} mastered. The tier ${tech.tier} test is open: ${TEST_LENGTH} unnamed boards from everything so far.`,
      label: 'Take the test',
      view: { kind: 'test', tier: tech.tier },
    };
  }
  return { text: `${tech.name} mastered.`, label: '', view: null };
};

export default GirihApp;
