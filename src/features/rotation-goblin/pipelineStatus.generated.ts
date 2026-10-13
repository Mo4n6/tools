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
  runId: 38343212209 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/38343212209" as string | null,
  event: "schedule",
  headSha: "44e14dc351a8ce715d666fd975f6b66d04dbb62e",
  branch: "main",
  startedAt: "2026-10-13T03:45:30Z" as string | null,
  completedAt: "2026-10-13T03:46:35Z" as string | null,
  recordedAt: "2026-10-13T03:46:45Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
