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
  runId: 37562872993 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/37562872993" as string | null,
  event: "schedule",
  headSha: "c038cee1a0fad73c842d47a9befa4afd4886588c",
  branch: "main",
  startedAt: "2026-10-07T02:37:36Z" as string | null,
  completedAt: "2026-10-07T02:38:29Z" as string | null,
  recordedAt: "2026-10-07T02:38:37Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
