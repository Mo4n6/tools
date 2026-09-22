export type PipelineConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'timed_out'
  | 'action_required'
  | 'neutral'
  | 'skipped'
  | 'unknown';

export const pipelineStatus = {
  workflow: 'Update Rotation Goblin market data',
  conclusion: 'success' as PipelineConclusion,
  runId: null as number | null,
  runUrl: null as string | null,
  event: 'seed',
  headSha: 'b89bea10d0ca622046c92371bbd1750660e1f9e3',
  branch: 'main',
  startedAt: null as string | null,
  completedAt: '2026-09-22T16:58:29Z',
  recordedAt: '2026-09-22T16:58:29Z',
  note: 'Seeded from the last integrity-gated production refresh. Future workflow outcomes are recorded automatically.',
} as const;
