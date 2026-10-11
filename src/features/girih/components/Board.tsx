// Girih — the 9x9 board, with candidates, highlights and chain links.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import type { KeyboardEvent } from 'react';
import { CELL_UNITS, MASK_DIGITS, bit, candidateKey, cellName, colOf, rowOf, type Candidate, type Grid } from '../engine/grid';
import type { Highlight, Link, Tone } from '../engine/types';

export type Overlay = {
  units?: number[];
  cells?: number[];
  highlights?: Highlight[];
  eliminations?: Candidate[];
  placements?: Candidate[];
  links?: Link[];
  digit?: number;
};

type BoardProps = {
  grid: Grid;
  showCandidates: boolean;
  label: string;
  cursor?: number | null;
  selected?: Set<number>;
  marks?: Set<number>;
  placements?: Map<number, number>;
  wrong?: Set<number>;
  overlay?: Overlay | null;
  onCell?: (cell: number) => void;
  onCandidate?: (cell: number, digit: number) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
};

const TONE_CLASS: Record<Tone, string> = {
  base: 'bg-cyan-400/35 text-cyan-50',
  fin: 'bg-amber-400/40 text-amber-50',
  on: 'bg-emerald-400/40 text-emerald-50',
  off: 'bg-violet-400/40 text-violet-50',
  alt: 'bg-fuchsia-400/35 text-fuchsia-50',
};

const borderClass = (cell: number): string => {
  const r = rowOf(cell);
  const c = colOf(cell);
  const right = c === 8 ? '' : c % 3 === 2 ? 'border-r-2 border-r-emerald-300/60' : 'border-r border-r-emerald-500/20';
  const bottom = r === 8 ? '' : r % 3 === 2 ? 'border-b-2 border-b-emerald-300/60' : 'border-b border-b-emerald-500/20';
  return `${right} ${bottom}`;
};

const centre = (cell: number, digit: number): [number, number] => {
  const k = digit - 1;
  return [colOf(cell) * 100 + (k % 3) * 33.33 + 16.67, rowOf(cell) * 100 + Math.floor(k / 3) * 33.33 + 16.67];
};

const Board = ({
  grid,
  showCandidates,
  label,
  cursor = null,
  selected,
  marks,
  placements,
  wrong,
  overlay,
  onCell,
  onCandidate,
  onKeyDown,
}: BoardProps): JSX.Element => {
  const tinted = new Set<number>();
  for (const unit of overlay?.units ?? []) {
    for (let cell = 0; cell < 81; cell += 1) {
      if (CELL_UNITS[cell].includes(unit)) {
        tinted.add(cell);
      }
    }
  }
  const outlined = new Set(overlay?.cells ?? []);
  const tones = new Map<number, Tone>();
  for (const h of overlay?.highlights ?? []) {
    tones.set(candidateKey(h), h.tone);
  }
  const removed = new Set((overlay?.eliminations ?? []).map(candidateKey));
  const revealed = new Map((overlay?.placements ?? []).map((p) => [p.cell, p.digit]));

  return (
    <div
      role="grid"
      aria-label={label}
      tabIndex={onKeyDown ? 0 : -1}
      onKeyDown={onKeyDown}
      className="relative mx-auto aspect-square w-full max-w-[34rem] select-none rounded-md border-2 border-emerald-300/70 bg-[#06100a] font-sans focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      style={{ containerType: 'inline-size' }}
    >
      <div className="grid h-full w-full grid-cols-9 grid-rows-9">
        {Array.from({ length: 9 }, (_, row) => (
          // display: contents keeps the 9x9 CSS grid while giving assistive tech real rows.
          <div key={row} role="row" className="contents">
            {Array.from({ length: 9 }, (_, col) => {
              const cell = row * 9 + col;
              const value = grid.values[cell];
              const placed = placements?.get(cell);
              const shown = revealed.get(cell);
              const isCursor = cursor === cell;
              const isSelected = selected?.has(cell) ?? false;
              const background = isSelected
                ? 'bg-cyan-500/25'
                : tinted.has(cell)
                  ? 'bg-cyan-300/[0.09]'
                  : 'bg-transparent';
              const rings = [
                outlined.has(cell) ? 'shadow-[inset_0_0_0_2px_rgba(103,232,249,0.85)]' : '',
                isSelected ? 'shadow-[inset_0_0_0_2px_rgba(165,243,252,0.95)]' : '',
                isCursor ? 'shadow-[inset_0_0_0_3px_rgba(252,211,77,0.95)]' : '',
              ]
                .filter(Boolean)
                .slice(-1)
                .join(' ');
              const candidates = MASK_DIGITS[grid.cands[cell]];
              const description = value
                ? `${cellName(cell)}, ${value}`
                : placed
                  ? `${cellName(cell)}, you placed ${placed}`
                  : showCandidates
                    ? `${cellName(cell)}, candidates ${candidates.join(' ')}`
                    : `${cellName(cell)}, empty`;
              return (
                <div
                  key={cell}
                  role="gridcell"
                  aria-label={description}
                  aria-selected={isSelected || isCursor}
                  onClick={() => onCell?.(cell)}
                  className={`relative ${borderClass(cell)} ${background} ${rings} ${onCell ? 'cursor-pointer' : ''}`}
                >
                  {value !== 0 ? (
                    <span
                      className={`flex h-full w-full items-center justify-center font-semibold ${
                        overlay?.digit === value ? 'text-amber-300' : 'text-emerald-50'
                      }`}
                      style={{ fontSize: '6.2cqw' }}
                    >
                      {value}
                    </span>
                  ) : shown !== undefined ? (
                    <span
                      className="flex h-full w-full items-center justify-center bg-emerald-400/20 font-semibold text-emerald-200"
                      style={{ fontSize: '6.2cqw' }}
                    >
                      {shown}
                    </span>
                  ) : placed !== undefined ? (
                    <span
                      className={`flex h-full w-full items-center justify-center font-semibold ${
                        wrong?.has(candidateKey({ cell, digit: placed })) ? 'bg-rose-600/50 text-white' : 'text-amber-200'
                      }`}
                      style={{ fontSize: '6.2cqw' }}
                    >
                      {placed}
                    </span>
                  ) : showCandidates ? (
                    <div className="grid h-full w-full grid-cols-3 grid-rows-3 p-[1px]">
                      {Array.from({ length: 9 }, (_, k) => {
                        const digit = k + 1;
                        if (!(grid.cands[cell] & bit(digit))) {
                          return <span key={digit} />;
                        }
                        const key = candidateKey({ cell, digit });
                        const tone = tones.get(key);
                        const isRemoved = removed.has(key);
                        const isMarked = marks?.has(key) ?? false;
                        const isWrong = wrong?.has(key) ?? false;
                        let className = 'text-emerald-200/70';
                        if (tone) {
                          className = TONE_CLASS[tone];
                        }
                        if (isMarked) {
                          className = isWrong
                            ? 'bg-rose-600 text-white line-through decoration-2'
                            : `${tone ? TONE_CLASS[tone] : 'text-rose-300'} line-through decoration-rose-400 decoration-2 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.9)]`;
                        }
                        // A revealed elimination wins over the player's own mark of it.
                        if (isRemoved) {
                          className = 'bg-rose-500/45 text-rose-50 line-through decoration-2';
                        }
                        return (
                          <span
                            key={digit}
                            onClick={
                              onCandidate
                                ? (event) => {
                                    event.stopPropagation();
                                    onCandidate(cell, digit);
                                  }
                                : undefined
                            }
                            className={`flex items-center justify-center rounded-[2px] leading-none ${className}`}
                            style={{ fontSize: '2.85cqw' }}
                          >
                            {digit}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {overlay?.links && overlay.links.length > 0 ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 900 900" aria-hidden="true">
          {overlay.links.map((link, i) => {
            const [x1, y1] = centre(link.from.cell, link.from.digit);
            const [x2, y2] = centre(link.to.cell, link.to.digit);
            // Bow each link a little so it doesn't run straight through the digits between.
            const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12;
            const my = (y1 + y2) / 2 - (x2 - x1) * 0.12;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`}
                fill="none"
                stroke={link.strong ? 'rgba(252,211,77,0.9)' : 'rgba(125,211,252,0.85)'}
                strokeWidth={link.strong ? 5 : 4}
                strokeDasharray={link.strong ? undefined : '10 9'}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      ) : null}
    </div>
  );
};

export default Board;
