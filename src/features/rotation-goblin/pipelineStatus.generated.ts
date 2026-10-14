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
  runId: 38499208172 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/38499208172" as string | null,
  event: "schedule",
  headSha: "ace56a5e230a4e5fd5f3387402857c8b609a0914",
  branch: "main",
  startedAt: "2026-10-14T02:05:32Z" as string | null,
  completedAt: "2026-10-14T02:06:19Z" as string | null,
  recordedAt: "2026-10-14T02:06:29Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
