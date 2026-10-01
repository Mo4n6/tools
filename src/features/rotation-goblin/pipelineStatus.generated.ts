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
  runId: 36805205693 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/36805205693" as string | null,
  event: "schedule",
  headSha: "54b3f542333dd096c7eff256b8046882814d6b51",
  branch: "main",
  startedAt: "2026-10-01T02:18:23Z" as string | null,
  completedAt: "2026-10-01T02:19:23Z" as string | null,
  recordedAt: "2026-10-01T02:19:34Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
