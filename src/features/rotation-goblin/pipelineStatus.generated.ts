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
  runId: 38990890803 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/38990890803" as string | null,
  event: "schedule",
  headSha: "fcd064b692866d86592e033fcecf78cd015adf83",
  branch: "main",
  startedAt: "2026-10-17T01:26:52Z" as string | null,
  completedAt: "2026-10-17T01:27:44Z" as string | null,
  recordedAt: "2026-10-17T01:27:53Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
