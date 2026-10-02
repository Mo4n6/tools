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
  runId: 36955872909 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/36955872909" as string | null,
  event: "schedule",
  headSha: "3e42ca36b4358cf9faa12bacb68adfd199493976",
  branch: "main",
  startedAt: "2026-10-02T02:29:37Z" as string | null,
  completedAt: "2026-10-02T02:30:37Z" as string | null,
  recordedAt: "2026-10-02T02:30:45Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
