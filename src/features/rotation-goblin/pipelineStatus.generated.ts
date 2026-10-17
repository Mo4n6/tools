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
  runId: 38991487187 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/38991487187" as string | null,
  event: "workflow_dispatch",
  headSha: "e82ca5b8d94a738c4bac8bba2c14a54e207e8697",
  branch: "main",
  startedAt: "2026-10-17T01:35:06Z" as string | null,
  completedAt: "2026-10-17T01:36:15Z" as string | null,
  recordedAt: "2026-10-17T06:54:29Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
