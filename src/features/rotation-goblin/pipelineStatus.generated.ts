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
  runId: 38018272468 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/38018272468" as string | null,
  event: "workflow_dispatch",
  headSha: "668e3ba2c997833de9f6d3eaf7c759d6730b01c0",
  branch: "main",
  startedAt: "2026-10-10T02:47:52Z" as string | null,
  completedAt: "2026-10-10T02:48:45Z" as string | null,
  recordedAt: "2026-10-10T07:03:53Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
