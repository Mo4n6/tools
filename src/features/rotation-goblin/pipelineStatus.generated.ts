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
  runId: 35777452353 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/35777452353" as string | null,
  event: "workflow_dispatch",
  headSha: "7138995d8040c82c445cd64bbbf7dd4291563cdd",
  branch: "main",
  startedAt: "2026-09-22T20:00:35Z" as string | null,
  completedAt: "2026-09-22T20:01:31Z" as string | null,
  recordedAt: "2026-09-23T00:31:35Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
