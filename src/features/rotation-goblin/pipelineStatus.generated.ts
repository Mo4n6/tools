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
  runId: 37877384781 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/37877384781" as string | null,
  event: "schedule",
  headSha: "750339fc7a13bf1811f337469662c540918670a9",
  branch: "main",
  startedAt: "2026-10-09T03:02:00Z" as string | null,
  completedAt: "2026-10-09T03:17:19Z" as string | null,
  recordedAt: "2026-10-09T03:17:29Z",
  note: "Latest market-data workflow did not complete successfully. Dashboard data remains the last committed snapshot and should be treated as stale until a successful refresh.",
} as const;
