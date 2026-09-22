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
  runId: 35772854339 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/35772854339" as string | null,
  event: "push",
  headSha: "d9908b7ba75a7f7f78aaa2d64909ca72234b577a",
  branch: "main",
  startedAt: "2026-09-22T19:17:42Z" as string | null,
  completedAt: "2026-09-22T19:18:46Z" as string | null,
  recordedAt: "2026-09-22T19:18:54Z",
  note: "Latest market-data workflow did not complete successfully. Dashboard data remains the last committed snapshot and should be treated as stale until a successful refresh.",
} as const;
