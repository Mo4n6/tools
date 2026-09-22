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
  conclusion: "failure" as PipelineConclusion,
  runId: 35766534574 as number | null,
  runUrl: "https://github.com/Mo4n6/tools/actions/runs/35766534574" as string | null,
  event: "push",
  headSha: "3fc71dea0f20c727c0688c2389c7c8a1e465d781",
  branch: "main",
  startedAt: "2026-09-22T18:20:44Z" as string | null,
  completedAt: "2026-09-22T18:21:09Z" as string | null,
  recordedAt: "2026-09-22T18:21:17Z",
  note: "Latest market-data workflow did not complete successfully. Dashboard data remains the last committed snapshot and should be treated as stale until a successful refresh.",
} as const;
