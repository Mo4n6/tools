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
  runId: 37089481672 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/37089481672" as string | null,
  event: "workflow_dispatch",
  headSha: "bb768e77946dda0149fcb7034cc7106a3c45b681",
  branch: "main",
  startedAt: "2026-10-03T02:20:46Z" as string | null,
  completedAt: "2026-10-03T02:22:04Z" as string | null,
  recordedAt: "2026-10-03T06:30:24Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
