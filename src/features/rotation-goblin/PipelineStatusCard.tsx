import { dataMeta } from './sampleData';

export function formatTimestamp(value: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

export function PipelineStatusCard({ healthy, reason, meta = dataMeta }: {
  healthy: boolean;
  reason: string;
  meta?: typeof dataMeta;
}): JSX.Element {
  const result = meta.pipeline.conclusion.replace(/_/g, ' ').toUpperCase();
  return (
    <aside aria-label="Live data pull status" className="w-full shrink-0 rounded-lg border border-emerald-500/30 bg-black/30 p-4 text-xs lg:w-[340px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold tracking-wider text-emerald-100">LIVE DATA PULL</h2>
        <span className={healthy ? 'font-bold text-lime-300' : 'font-bold text-amber-300'}>{healthy ? 'DATA CURRENT' : 'CHECK DATA'}</span>
      </div>
      <dl className="mt-3 space-y-2 text-emerald-100">
        <div><dt className="text-emerald-300/60">Last snapshot pull</dt><dd>{formatTimestamp(meta.technicals.generatedAt)}</dd></div>
        <div><dt className="text-emerald-300/60">Market session</dt><dd>{meta.technicalSessionAsOf}</dd></div>
        <div><dt className="text-emerald-300/60">Latest completed pull status</dt><dd className={meta.pipeline.conclusion === 'success' ? 'text-lime-300' : 'text-amber-300'}>{result}</dd></div>
        <div><dt className="text-emerald-300/60">Workflow completed</dt><dd>{formatTimestamp(meta.pipeline.completedAt)}</dd></div>
      </dl>
      <p className="mt-3 text-emerald-300/70">{reason}</p>
      <p className="mt-2 text-emerald-300/50">Snapshot status at deployment; not a real-time run monitor. Scheduled weekdays at 23:30 UTC.</p>
      {meta.pipeline.runUrl ? <a href={meta.pipeline.runUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-lime-300 underline underline-offset-2">View latest recorded workflow ↗</a> : null}
    </aside>
  );
}
