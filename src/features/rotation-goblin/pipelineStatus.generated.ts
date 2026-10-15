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
  runId: 38667109612 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/38667109612" as string | null,
  event: "schedule",
  headSha: "d0305eddd0fb8ef44cc71d94a05627d79411eb10",
  branch: "main",
  startedAt: "2026-10-15T01:42:37Z" as string | null,
  completedAt: "2026-10-15T01:43:25Z" as string | null,
  recordedAt: "2026-10-15T01:43:34Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
