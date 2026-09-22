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
  runId: 35759297979 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/35759297979" as string | null,
  event: "push",
  headSha: "53233450df250a9034dfb1a12177eb0171e2ac41",
  branch: "main",
  startedAt: "2026-09-22T17:13:42Z" as string | null,
  completedAt: "2026-09-22T17:14:20Z" as string | null,
  recordedAt: "2026-09-22T17:14:27Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
