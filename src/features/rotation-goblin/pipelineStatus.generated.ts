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
  runId: 36083437623 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/36083437623" as string | null,
  event: "schedule",
  headSha: "b6924708752686bb425a69b67c1f5e64a26455bd",
  branch: "main",
  startedAt: "2026-09-25T01:46:05Z" as string | null,
  completedAt: "2026-09-25T01:47:05Z" as string | null,
  recordedAt: "2026-09-25T01:47:15Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
