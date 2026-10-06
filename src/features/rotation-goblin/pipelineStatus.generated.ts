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
  runId: 36209793957 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/36209793957" as string | null,
  event: "schedule",
  headSha: "a71e9beda54f6a7c3798881acba4fea642d95b20",
  branch: "main",
  startedAt: "2026-09-26T01:51:05Z" as string | null,
  completedAt: "2026-09-26T01:51:59Z" as string | null,
  recordedAt: "2026-10-06T15:08:53Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
