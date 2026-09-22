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
  runId: 35773362760 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/35773362760" as string | null,
  event: "push",
  headSha: "02e3e5ef092dc93782d21e87f2afc26f58a9f05b",
  branch: "main",
  startedAt: "2026-09-22T19:22:25Z" as string | null,
  completedAt: "2026-09-22T19:23:37Z" as string | null,
  recordedAt: "2026-09-22T19:23:45Z",
  note: "Latest market-data workflow did not complete successfully. Dashboard data remains the last committed snapshot and should be treated as stale until a successful refresh.",
} as const;
