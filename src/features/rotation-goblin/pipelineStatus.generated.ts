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
  runId: 38835921310 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/38835921310" as string | null,
  event: "schedule",
  headSha: "49128b88400fd434b9618cbb5991d8754060bb18",
  branch: "main",
  startedAt: "2026-10-16T01:35:14Z" as string | null,
  completedAt: "2026-10-16T01:36:12Z" as string | null,
  recordedAt: "2026-10-16T01:36:22Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
