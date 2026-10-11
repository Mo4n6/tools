// Girih — key to the colours on a revealed move.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import type { Finding, Tone } from '../engine/types';

const TONE_LABEL: Record<Tone, string> = {
  base: 'pattern',
  fin: 'fin / key digit',
  on: 'true in the chain',
  off: 'false in the chain',
  alt: 'second set',
};

const TONE_SWATCH: Record<Tone, string> = {
  base: 'bg-cyan-400/60',
  fin: 'bg-amber-400/60',
  on: 'bg-emerald-400/60',
  off: 'bg-violet-400/60',
  alt: 'bg-fuchsia-400/60',
};

const Legend = ({ finding }: { finding: Finding }): JSX.Element | null => {
  const tones = [...new Set(finding.highlights.map((h) => h.tone))];
  const strong = finding.links.some((l) => l.strong);
  const weak = finding.links.some((l) => !l.strong);
  const coloring = finding.technique === 'simple-coloring';
  const items: JSX.Element[] = tones.map((tone) => (
    <span key={tone} className="inline-flex items-center gap-1">
      <span className={`inline-block h-3 w-3 rounded-sm ${TONE_SWATCH[tone]}`} />
      {coloring && (tone === 'on' || tone === 'off') ? (tone === 'on' ? 'shade A' : 'shade B') : TONE_LABEL[tone]}
    </span>
  ));
  if (finding.eliminations.length > 0) {
    items.push(
      <span key="removed" className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-rose-500/60" />
        removed
      </span>,
    );
  }
  if (finding.placements.length > 0) {
    items.push(
      <span key="placed" className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-emerald-400/40" />
        placed
      </span>,
    );
  }
  if (strong) {
    items.push(
      <span key="strong" className="inline-flex items-center gap-1">
        <span className="inline-block h-0.5 w-4 bg-amber-300" />
        strong link
      </span>,
    );
  }
  if (weak) {
    items.push(
      <span key="weak" className="inline-flex items-center gap-1">
        <span className="inline-block w-4 border-t-2 border-dashed border-sky-300" />
        weak link
      </span>,
    );
  }
  if (items.length === 0) {
    return null;
  }
  return <div className="mx-auto flex max-w-[34rem] flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-200/80">{items}</div>;
};

export default Legend;
