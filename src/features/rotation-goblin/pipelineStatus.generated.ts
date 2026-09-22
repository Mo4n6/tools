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
  runId: 35770437472 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/35770437472" as string | null,
  event: "push",
  headSha: "10fc7a69f561b64423b09764d541d140a1b57350",
  branch: "main",
  startedAt: "2026-09-22T18:55:45Z" as string | null,
  completedAt: "2026-09-22T18:56:37Z" as string | null,
  recordedAt: "2026-09-22T18:56:53Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
