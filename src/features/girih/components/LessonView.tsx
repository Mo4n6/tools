// Girih — a technique explained, then walked through on a real board.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import { useState } from 'react';
import { LESSONS } from '../content/lessons';
import { whereToLook, type Drill } from '../drill';
import { techniqueById } from '../engine/catalog';
import Board, { type Overlay } from './Board';
import { buttonClass, primaryButtonClass } from './DrillView';
import Legend from './Legend';

type LessonViewProps = {
  drill: Drill;
  onAnotherExample: () => void;
  onPractice: () => void;
};

const LessonView = ({ drill, onAnotherExample, onPractice }: LessonViewProps): JSX.Element => {
  const technique = techniqueById(drill.technique);
  const lesson = LESSONS[drill.technique];
  const example = drill.findings[0];
  const hasPattern = example.highlights.length > 0 || example.links.length > 0;

  type Step = { title: string; caption: string; overlay: Overlay | null };
  const steps: Step[] = [
    {
      title: 'The board',
      caption: `Here is a position where ${technique.name} is the simplest move: nothing earlier in the course makes progress.${
        technique.tier === 1 ? '' : ' Small digits are the candidates still open in each cell.'
      }`,
      overlay: null,
    },
    {
      title: 'Where to look',
      caption: whereToLook(example),
      overlay: { units: example.units, digit: example.digit, cells: example.units.length === 0 ? example.pattern : undefined },
    },
    ...(hasPattern
      ? [
          {
            title: 'The pattern',
            caption: `Highlighted: the cells that form the ${technique.name}.${example.links.length > 0 ? ' Solid lines are strong links, dashed lines weak ones.' : ''}`,
            overlay: { cells: example.pattern, highlights: example.highlights, links: example.links, digit: example.digit },
          },
        ]
      : []),
    {
      title: 'The move',
      caption: example.text,
      overlay: {
        units: example.units,
        cells: example.pattern,
        highlights: example.highlights,
        eliminations: example.eliminations,
        placements: example.placements,
        links: example.links,
        digit: example.digit,
      },
    },
  ];
  const [step, setStep] = useState(0);
  const current = steps[Math.min(step, steps.length - 1)];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      <div className="space-y-3">
        <Board grid={drill.grid} showCandidates={technique.tier > 1} label={`${technique.name} example`} overlay={current.overlay} />
        {step === steps.length - 1 ? <Legend finding={example} /> : null}
        <div className="mx-auto max-w-[34rem] rounded-md border border-cyan-400/40 bg-cyan-500/10 p-3 text-sm leading-relaxed text-cyan-50">
          <div className="mb-1 text-xs uppercase tracking-wide text-cyan-200/80">
            Step {Math.min(step, steps.length - 1) + 1} of {steps.length}: {current.title}
          </div>
          {current.caption}
        </div>
        <div className="mx-auto flex max-w-[34rem] flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </button>
          {step < steps.length - 1 ? (
            <button type="button" className={primaryButtonClass} onClick={() => setStep((s) => s + 1)}>
              Next step
            </button>
          ) : (
            <button type="button" className={primaryButtonClass} onClick={onPractice}>
              Practice {technique.name}
            </button>
          )}
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setStep(0);
              onAnotherExample();
            }}
          >
            Another example
          </button>
        </div>
      </div>
      <article className="space-y-4 text-sm leading-relaxed text-emerald-100/90">
        <div>
          <h3 className="text-lg font-semibold text-emerald-100">{technique.name}</h3>
          {lesson.aka ? <p className="text-xs text-emerald-300/70">Also called {lesson.aka}</p> : null}
          <p className="mt-2 text-emerald-50">{lesson.summary}</p>
        </div>
        <section>
          <h4 className="font-semibold text-emerald-200">How it works</h4>
          <p className="mt-1">{lesson.how}</p>
        </section>
        <section>
          <h4 className="font-semibold text-emerald-200">How to spot it</h4>
          <p className="mt-1">{lesson.spot}</p>
        </section>
      </article>
    </div>
  );
};

export default LessonView;
