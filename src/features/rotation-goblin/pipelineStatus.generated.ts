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
  runId: 35768851772 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/35768851772" as string | null,
  event: "push",
  headSha: "40de34382103bb9ef2e2d669f78ddecfe733d3f3",
  branch: "main",
  startedAt: "2026-09-22T18:41:33Z" as string | null,
  completedAt: "2026-09-22T18:42:22Z" as string | null,
  recordedAt: "2026-09-22T18:42:30Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
