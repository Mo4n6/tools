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
  runId: 37719858222 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/37719858222" as string | null,
  event: "schedule",
  headSha: "f88a692b9c2654058431eba64d6c8ca0a3f5399e",
  branch: "main",
  startedAt: "2026-10-08T02:50:45Z" as string | null,
  completedAt: "2026-10-08T02:51:43Z" as string | null,
  recordedAt: "2026-10-08T02:51:53Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
