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
  runId: 35758286945 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/35758286945" as string | null,
  event: "push",
  headSha: "e067618e618a73aacfe286ba3c1b66a4e9cfaf12",
  branch: "main",
  startedAt: "2026-09-22T17:04:22Z" as string | null,
  completedAt: "2026-09-22T17:05:06Z" as string | null,
  recordedAt: "2026-09-22T17:05:15Z",
  note: "Latest market-data workflow completed successfully.",
} as const;
