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
  runId: 35802436303 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/35802436303" as string | null,
  event: "push",
  headSha: "3d62373926b41dcd2bffc3b00217a058e2cf9034",
  branch: "main",
  startedAt: "2026-09-23T00:31:27Z" as string | null,
  completedAt: "2026-09-23T00:32:19Z" as string | null,
  recordedAt: "2026-09-23T00:32:27Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
