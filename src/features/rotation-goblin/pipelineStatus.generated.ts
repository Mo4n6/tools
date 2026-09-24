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
  runId: 35943644169 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/35943644169" as string | null,
  event: "schedule",
  headSha: "7184b6204597ad164df36fa6c8d2a390032b84e5",
  branch: "main",
  startedAt: "2026-09-24T01:36:06Z" as string | null,
  completedAt: "2026-09-24T01:36:57Z" as string | null,
  recordedAt: "2026-09-24T01:37:06Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
