import type { RunStatus } from '@spm/shared';
import type { Repository, RunRow, StageRow } from '../db/repository.js';

export const STAGE_NAMES = [
  'requirements',
  'stories',
  'tasks',
  'estimates',
  'dependencies',
  'schedule',
  'risks',
  'assemble',
] as const;

function stageEntry(row: StageRow): RunStatus['stages'][number] {
  const entry: RunStatus['stages'][number] = {
    stage: row.stage,
    name: STAGE_NAMES[row.stage - 1] ?? `stage-${row.stage}`,
    status: row.status,
  };
  if (row.status === 'succeeded' || row.status === 'cached' || row.status === 'failed') {
    entry.attempts = row.attempts;
    if (row.latencyMs !== null) entry.latency_ms = Math.max(0, Math.round(row.latencyMs));
  }
  return entry;
}

/** The RunStatus the UI polls every 2 s (design document C3). */
export async function buildRunStatus(repo: Repository, run: RunRow): Promise<RunStatus> {
  const [stages, issues] = await Promise.all([
    repo.getStages(run.id),
    repo.countIssuesBySeverity(run.id),
  ]);
  return {
    run_id: run.id,
    status: run.status,
    current_stage: run.currentStage,
    stages: stages.map(stageEntry),
    issues_count: issues,
    cycle: run.cycle,
    error: run.error,
  };
}
