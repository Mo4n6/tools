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
  runId: 37408055393 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/37408055393" as string | null,
  event: "schedule",
  headSha: "564ab38fe5ff4ad67b9f11f2d73d4a523d6b5746",
  branch: "main",
  startedAt: "2026-10-06T03:14:41Z" as string | null,
  completedAt: "2026-10-06T03:15:41Z" as string | null,
  recordedAt: "2026-10-06T20:17:27Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
