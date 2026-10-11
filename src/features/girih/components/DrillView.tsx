// Girih — one drill: find the pattern, act on it, get told why.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { LESSONS } from '../content/lessons';
import { judge, matchPattern, whereToLook, type Drill } from '../drill';
import { techniqueById } from '../engine/catalog';
import { candidateKey, describeCandidates, type Candidate } from '../engine/grid';
import type { Finding, TechniqueId } from '../engine/types';
import Board, { type Overlay } from './Board';
import Legend from './Legend';

export type DrillMode = 'practice' | 'recognize';

type Feedback = { tone: 'info' | 'good' | 'bad'; text: string };

type DrillViewProps = {
  drill: Drill;
  mode: DrillMode;
  onResolved: (outcome: { correct: boolean; clean: boolean }) => void;
  onNext: () => void;
  nextLabel?: string;
};

export const buttonClass =
  'rounded-md border border-emerald-500/40 bg-[#0a160f] px-3 py-1.5 text-sm text-emerald-100 hover:border-emerald-300/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50';
export const primaryButtonClass =
  'rounded-md border border-emerald-300/70 bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-50 hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50';

const feedbackClass: Record<Feedback['tone'], string> = {
  info: 'border-emerald-500/30 bg-[#0a160f] text-emerald-100/90',
  good: 'border-emerald-300/60 bg-emerald-500/15 text-emerald-50',
  bad: 'border-rose-400/60 bg-rose-500/10 text-rose-100',
};

const DrillView = ({ drill, mode, onResolved, onNext, nextLabel = 'Next board' }: DrillViewProps): JSX.Element => {
  const technique = techniqueById(drill.technique);
  const lesson = LESSONS[drill.technique];
  const showCandidates = technique.tier > 1;
  const needPattern = mode === 'practice' && technique.patternStep;

  const [phase, setPhase] = useState<'pattern' | 'act' | 'done'>(needPattern ? 'pattern' : 'act');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [marks, setMarks] = useState<Set<number>>(new Set());
  const [placements, setPlacements] = useState<Map<number, number>>(new Map());
  const [wrong, setWrong] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState<number | null>(null);
  const [inputMode, setInputMode] = useState<'eliminate' | 'place'>(showCandidates ? 'eliminate' : 'place');
  const [hints, setHints] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [chosen, setChosen] = useState<Finding[]>([]);
  const [shown, setShown] = useState<Finding | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [found, setFound] = useState<TechniqueId>(drill.technique);
  const resolved = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const focus = chosen[0] ?? drill.findings[0];
  // Hints stop short of the answer; Show answer is its own button.
  const maxHints = mode === 'recognize' ? 3 : 2;
  // In recognize mode the first hint names the technique; the rest match practice.
  const hintStage = mode === 'recognize' ? hints - 1 : hints;

  useEffect(() => {
    boardRef.current?.querySelector<HTMLDivElement>('[role="grid"]')?.focus({ preventScroll: true });
  }, []);

  const resolve = (correct: boolean, clean: boolean): void => {
    if (!resolved.current) {
      resolved.current = true;
      onResolved({ correct, clean });
    }
  };

  const prompt = ((): string => {
    if (phase === 'done') {
      const name = techniqueById(found).name;
      return mode === 'recognize'
        ? `That was ${article(name)} ${name}.`
        : `That's the ${technique.name}. Read why below.`;
    }
    if (mode === 'recognize') {
      return showCandidates
        ? 'Find the simplest move on this board. Strike out the candidates it removes, or place the digit it proves.'
        : 'Find the simplest move on this board and place the digit.';
    }
    if (phase === 'pattern') {
      return `Find the ${technique.name}. ${lesson.patternPrompt ?? ''} Then press Check pattern.`;
    }
    if (technique.places) {
      return `Find the ${technique.name} and place its digit: tap the cell, then the digit.`;
    }
    return `Strike out every candidate the ${technique.name} removes, then press Check.`;
  })();

  const toggleSelected = (cell: number): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cell)) {
        next.delete(cell);
      } else {
        next.add(cell);
      }
      return next;
    });
  };

  const toggleMark = (cell: number, digit: number): void => {
    if (!(drill.grid.cands[cell] & (1 << (digit - 1)))) {
      return;
    }
    const key = candidateKey({ cell, digit });
    setMarks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setWrong(new Set());
  };

  const togglePlacement = (cell: number, digit: number): void => {
    if (drill.grid.values[cell] !== 0) {
      return;
    }
    if (showCandidates && !(drill.grid.cands[cell] & (1 << (digit - 1)))) {
      return;
    }
    setPlacements((prev) => {
      const next = new Map(prev);
      if (next.get(cell) === digit) {
        next.delete(cell);
      } else {
        next.set(cell, digit);
      }
      return next;
    });
    setWrong(new Set());
  };

  const onCell = (cell: number): void => {
    if (phase === 'done') {
      return;
    }
    setCursor(cell);
    if (phase === 'pattern') {
      toggleSelected(cell);
    }
  };

  const onCandidate = (cell: number, digit: number): void => {
    if (phase === 'done') {
      return;
    }
    setCursor(cell);
    if (phase === 'pattern') {
      toggleSelected(cell);
      return;
    }
    if (inputMode === 'eliminate') {
      toggleMark(cell, digit);
    } else {
      togglePlacement(cell, digit);
    }
  };

  const onDigit = (digit: number): void => {
    if (phase !== 'act') {
      return;
    }
    if (cursor === null) {
      setFeedback({ tone: 'info', text: 'Select a cell first.' });
      return;
    }
    if (inputMode === 'eliminate') {
      toggleMark(cursor, digit);
    } else {
      togglePlacement(cursor, digit);
    }
  };

  const clearAll = (): void => {
    setMarks(new Set());
    setPlacements(new Map());
    setSelected(new Set());
    setWrong(new Set());
  };

  const checkPattern = (): void => {
    if (selected.size === 0) {
      setFeedback({ tone: 'info', text: 'Tap the cells that make up the pattern first.' });
      return;
    }
    const matches = matchPattern(drill, [...selected]);
    if (matches.length === 0) {
      setMistakes((m) => m + 1);
      setFeedback({ tone: 'bad', text: `Those cells don't form a ${technique.name}. Adjust the selection, or take a hint.` });
      return;
    }
    setChosen(matches);
    setPhase('act');
    setFeedback({
      tone: 'good',
      text: technique.places ? "That's the pattern. Now place the digit it gives you." : "That's the pattern. Now strike out what it removes.",
    });
  };

  const answer = (): { placements: Candidate[]; eliminations: Candidate[] } => ({
    placements: [...placements.entries()].map(([cell, digit]) => ({ cell, digit })),
    eliminations: [...marks].map((key) => ({ cell: Math.floor(key / 9), digit: (key % 9) + 1 })),
  });

  const check = (): void => {
    const verdict = judge(drill, answer(), { restrictTo: chosen, acceptSameTier: mode === 'recognize' });
    if (verdict.kind === 'empty') {
      setFeedback({
        tone: 'info',
        text: showCandidates ? 'Strike out a candidate (or place a digit) first.' : 'Place a digit first: tap a cell, then a number.',
      });
      return;
    }
    if (verdict.kind === 'wrong') {
      setMistakes((m) => m + 1);
      setWrong(new Set([...verdict.falseEliminations, ...verdict.falsePlacements].map(candidateKey)));
      const count = verdict.falseEliminations.length + verdict.falsePlacements.length;
      setFeedback({
        tone: 'bad',
        text: `${count === 1 ? 'One mark is' : `${count} marks are`} wrong, shown in red: ${
          verdict.falsePlacements.length > 0 ? 'that digit does not belong there' : 'that candidate is actually the answer'
        }. Undo ${count === 1 ? 'it' : 'them'} and look again.`,
      });
      return;
    }
    if (verdict.kind === 'elsewhere') {
      setMistakes((m) => m + 1);
      setFeedback({
        tone: 'bad',
        text: `True, but those come from a different ${technique.name} on this board, not the one you marked. Strike out what your pattern removes.`,
      });
      return;
    }
    if (verdict.kind === 'other') {
      setMistakes((m) => m + 1);
      const other = verdict.technique ? techniqueById(verdict.technique).name : null;
      let text: string;
      if (mode === 'recognize') {
        text = other
          ? `True, and it's a valid ${other}, but there is a simpler move on this board. Look for that first.`
          : "Those marks are true, but nothing on the board proves them yet. Look for a move you can justify.";
      } else {
        text = other
          ? `True, but that comes from ${article(other)} ${other}, not the ${technique.name}. Find the ${technique.name}.`
          : `Those marks are true, but they don't follow from the ${technique.name}. Find the pattern first.`;
      }
      setFeedback({ tone: 'bad', text });
      return;
    }
    const clean = mistakes === 0 && hints === 0;
    setFound(verdict.technique);
    setShown(verdict.finding);
    setPhase('done');
    resolve(true, clean);
    const extra =
      verdict.missing.length > 0
        ? ` It also ${verdict.finding.placements.length > 0 ? 'places' : 'removes'} ${describeMissing(verdict.missing)}.`
        : '';
    const also =
      verdict.technique !== drill.technique
        ? ` The board also has ${article(technique.name)} ${technique.name}, the move it was built around.`
        : '';
    setFeedback({
      tone: 'good',
      text: `${clean ? 'Correct.' : 'Correct, with help.'}${extra}${also}`,
    });
  };

  const hint = (): void => {
    const next = Math.min(hints + 1, maxHints);
    setHints(next);
    const stage = mode === 'recognize' ? next - 1 : next;
    if (mode === 'recognize' && next === 1) {
      setFeedback({ tone: 'info', text: `It's ${article(technique.name)} ${technique.name}. ${lesson.summary}` });
      return;
    }
    if (stage === 1) {
      setFeedback({ tone: 'info', text: whereToLook(focus) });
      return;
    }
    if (stage === 2) {
      if (phase === 'pattern') {
        setSelected(new Set(focus.pattern));
        setChosen([focus]);
        setPhase('act');
      }
      setFeedback({
        tone: 'info',
        text: technique.places
          ? 'The pattern is highlighted. Place the digit it proves.'
          : 'The pattern is highlighted. Strike out what it removes.',
      });
    }
  };

  const reveal = (): void => {
    setShown(focus);
    setPhase('done');
    resolve(false, false);
    setFeedback({ tone: 'info', text: 'Here is the move. Read why, then try another board.' });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const move: Record<string, number> = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
    if (event.key in move) {
      event.preventDefault();
      const from = cursor ?? 40;
      const delta = move[event.key];
      const col = from % 9;
      if ((delta === -1 && col === 0) || (delta === 1 && col === 8)) {
        return;
      }
      const to = from + delta;
      if (to >= 0 && to < 81) {
        setCursor(to);
      }
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      onDigit(Number(event.key));
      return;
    }
    if ((event.key === ' ' || event.key === 'Spacebar') && phase === 'pattern' && cursor !== null) {
      event.preventDefault();
      toggleSelected(cursor);
      return;
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && cursor !== null) {
      event.preventDefault();
      setPlacements((prev) => {
        const next = new Map(prev);
        next.delete(cursor);
        return next;
      });
      setMarks((prev) => new Set([...prev].filter((key) => Math.floor(key / 9) !== cursor)));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (phase === 'pattern') {
        checkPattern();
      } else if (phase === 'act') {
        check();
      } else {
        onNext();
      }
    }
  };

  let overlay: Overlay | null = null;
  if (phase === 'done' && shown) {
    overlay = {
      units: shown.units,
      cells: shown.pattern,
      highlights: shown.highlights,
      eliminations: shown.eliminations,
      placements: shown.placements,
      links: shown.links,
      digit: shown.digit,
    };
  } else if (hintStage >= 2) {
    // Singles have no pattern beyond the cell itself, so point at the cell.
    const cells = focus.pattern.length > 0 ? focus.pattern : focus.placements.map((p) => p.cell);
    overlay = { units: focus.units, cells, highlights: focus.highlights, links: focus.links, digit: focus.digit };
  } else if (hintStage === 1) {
    overlay = { units: focus.units, digit: focus.digit, cells: focus.units.length === 0 ? focus.pattern : undefined };
  } else if (chosen.length > 0) {
    overlay = { cells: chosen[0].pattern };
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-emerald-100/90">{prompt}</p>
      <div ref={boardRef}>
        <Board
          grid={drill.grid}
          showCandidates={showCandidates}
          label={`Sudoku board. ${prompt}`}
          cursor={phase === 'done' ? null : cursor}
          selected={phase === 'pattern' || (chosen.length === 0 && selected.size > 0) ? selected : undefined}
          marks={marks}
          placements={placements}
          wrong={wrong}
          overlay={overlay}
          onCell={onCell}
          onCandidate={onCandidate}
          onKeyDown={onKeyDown}
        />
      </div>
      {phase === 'done' && shown ? <Legend finding={shown} /> : null}

      {phase === 'act' ? (
        <div className="mx-auto flex max-w-[34rem] flex-wrap items-center gap-2">
          {showCandidates ? (
            <div className="flex overflow-hidden rounded-md border border-emerald-500/40 text-sm" role="group" aria-label="Input mode">
              {(['eliminate', 'place'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setInputMode(value)}
                  aria-pressed={inputMode === value}
                  className={`px-3 py-1.5 ${inputMode === value ? 'bg-emerald-500/25 text-emerald-50' : 'bg-[#0a160f] text-emerald-300/80'}`}
                >
                  {value === 'eliminate' ? 'Strike out' : 'Place'}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1" role="group" aria-label="Digits">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => onDigit(digit)}
                className="h-8 w-8 rounded border border-emerald-500/40 bg-[#0a160f] text-sm text-emerald-50 hover:border-emerald-300/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                aria-label={`${inputMode === 'eliminate' ? 'Strike out' : 'Place'} ${digit}`}
              >
                {digit}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {feedback ? (
        <p className={`mx-auto max-w-[34rem] rounded-md border px-3 py-2 text-sm ${feedbackClass[feedback.tone]}`} role="status">
          {feedback.text}
        </p>
      ) : null}

      {phase === 'done' && shown ? (
        <p className="mx-auto max-w-[34rem] rounded-md border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm leading-relaxed text-cyan-50">
          {shown.text}
        </p>
      ) : null}

      <div className="mx-auto flex max-w-[34rem] flex-wrap gap-2">
        {phase === 'pattern' ? (
          <button type="button" className={primaryButtonClass} onClick={checkPattern}>
            Check pattern
          </button>
        ) : null}
        {phase === 'act' ? (
          <button type="button" className={primaryButtonClass} onClick={check}>
            Check
          </button>
        ) : null}
        {phase !== 'done' ? (
          <>
            <button type="button" className={buttonClass} onClick={hint} disabled={hints >= maxHints}>
              {hintLabel(mode, hints)}
            </button>
            <button type="button" className={buttonClass} onClick={clearAll}>
              Clear
            </button>
            <button type="button" className={buttonClass} onClick={reveal}>
              Show answer
            </button>
          </>
        ) : (
          <button type="button" className={primaryButtonClass} onClick={onNext}>
            {nextLabel}
          </button>
        )}
      </div>
      {phase !== 'done' ? (
        <p className="mx-auto max-w-[34rem] text-xs text-emerald-300/60">
          Keyboard: arrows move, 1–9 {showCandidates ? 'strike out or place' : 'place'}, Enter checks
          {phase === 'pattern' ? ', Space selects a cell' : ''}.
        </p>
      ) : null}
    </div>
  );
};

const article = (name: string): string => (/^[AEIOUX]/i.test(name) && !/^Uni/i.test(name) ? 'an' : 'a');

const hintLabel = (mode: DrillMode, used: number): string => {
  const labels = mode === 'recognize' ? ['Hint: name it', 'Hint: where', 'Hint: pattern'] : ['Hint: where', 'Hint: pattern'];
  return labels[Math.min(used, labels.length - 1)];
};

const describeMissing = (list: Candidate[]): string => describeCandidates(list);

export default DrillView;
