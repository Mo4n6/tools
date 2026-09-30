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
  runId: 36659185894 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/36659185894" as string | null,
  event: "schedule",
  headSha: "8390cfb65150d4f6160f690e984f6301186ce336",
  branch: "main",
  startedAt: "2026-09-30T02:17:50Z" as string | null,
  completedAt: "2026-09-30T02:18:41Z" as string | null,
  recordedAt: "2026-09-30T02:18:52Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
