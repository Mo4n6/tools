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
  runId: 35807352963 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/35807352963" as string | null,
  event: "schedule",
  headSha: "40972e9c75706fc643ab3e1c3e04d03c827a44fd",
  branch: "main",
  startedAt: "2026-09-23T01:41:46Z" as string | null,
  completedAt: "2026-09-23T01:42:41Z" as string | null,
  recordedAt: "2026-09-23T01:42:50Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
