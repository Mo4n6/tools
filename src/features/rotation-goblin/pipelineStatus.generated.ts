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
  conclusion: "success" as PipelineConclusion,
  runId: 38017567577 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/38017567577" as string | null,
  event: "schedule",
  headSha: "8adc1327ac071d98821834c652325cf3045475fe",
  branch: "main",
  startedAt: "2026-10-10T02:36:11Z" as string | null,
  completedAt: "2026-10-10T02:36:52Z" as string | null,
  recordedAt: "2026-10-10T02:37:04Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
