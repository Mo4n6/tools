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
  conclusion: "failure" as PipelineConclusion,
  runId: 35767074662 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/35767074662" as string | null,
  event: "push",
  headSha: "9382be8bacee11de661113fd1be9f3c8bca73176",
  branch: "main",
  startedAt: "2026-09-22T18:25:40Z" as string | null,
  completedAt: "2026-09-22T18:26:05Z" as string | null,
  recordedAt: "2026-09-22T18:26:14Z",
  note: "Latest market-data workflow did not complete successfully. Dashboard data remains the last committed snapshot and should be treated as stale until a successful refresh.",
} as const;
