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
  conclusion: "cancelled" as PipelineConclusion,
  runId: 36513691567 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/36513691567" as string | null,
  event: "schedule",
  headSha: "5391e5fec4bdf869ca94b553c120891f6bde55ce",
  branch: "main",
  startedAt: "2026-09-29T02:40:25Z" as string | null,
  completedAt: "2026-09-29T02:55:42Z" as string | null,
  recordedAt: "2026-09-29T02:55:51Z",
  note: "Latest market-data workflow did not complete successfully. Dashboard data remains the last committed snapshot and should be treated as stale until a successful refresh.",
} as const;
