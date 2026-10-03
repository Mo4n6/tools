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
  runId: 37089114468 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/37089114468" as string | null,
  event: "schedule",
  headSha: "009ac9ff7c458b29448ae9207cfab7e5525dc8ca",
  branch: "main",
  startedAt: "2026-10-03T02:14:41Z" as string | null,
  completedAt: "2026-10-03T02:15:40Z" as string | null,
  recordedAt: "2026-10-03T02:15:49Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
