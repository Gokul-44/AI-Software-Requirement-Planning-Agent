import { findDuplicateTitles } from '@spm/scheduler';
import type { Plan } from '@spm/shared';

/**
 * Evaluation metrics (design document E3). Everything here is computed from what a run actually did:
 * the harness calls recorded by `RecordingHarness` and the plan and issues the run stored. Nothing
 * is estimated, and a metric with no data behind it is `null` (never 0).
 */

/** One harness call (`callStage`): one logical LLM call with up to 3 attempts. */
export interface CallRecord {
  stage: number;
  schemaName: string;
  /** LLM requests made for this call (1 = valid on the first try). */
  attempts: number;
  outcome: 'ok' | 'invalid' | 'infra';
  /** Error code when the call failed (VALIDATION_FAILED, QUOTA_EXHAUSTED, ...). */
  failureCode: string | null;
  inputTokens: number;
  outputTokens: number;
  /** References the model proposed in the attempts that reached the semantic check, and the unknown ones. */
  refsProposed: number;
  refsInvalid: number;
}

/** What the stored run and its plan say after the pipeline stopped. */
export interface RunFacts {
  status: 'queued' | 'running' | 'needs_resolution' | 'succeeded' | 'failed';
  /** Stage that failed (from the run error), when the run failed. */
  failedStage: number | null;
  /** Error code in the run error details, for example QUOTA_EXHAUSTED. */
  errorCode: string | null;
  /** Stage rows that started (any status except pending). */
  stagesRun: number;
  /** Stage rows that ended failed. */
  stagesFailed: number;
  /** Issues of the run, whether or not a plan exists (stage 5 saves them before stage 8). */
  issues: { kind: string; message: string }[];
  /** Edges proposed by the model that were kept (source llm). */
  edgesKept: number;
  inputTokens: number;
  outputTokens: number;
  plan: Plan | null;
}

export interface RunMetrics {
  status: RunFacts['status'];
  failedStage: number | null;
  failureCode: string | null;
  /** Calls to the model (calls that were not cut off by the provider). */
  calls: number;
  callsFirstTryValid: number;
  repairRetries: number;
  llmRequests: number;
  /** Calls cut off by quota or provider errors. They say nothing about output quality. */
  infraFailedCalls: number;
  /** Stages that ran, and stages that failed because the OUTPUT stayed invalid (not quota). */
  stagesRun: number;
  stagesFailedValidation: number;
  stagesStoppedByQuota: number;
  refsProposed: number;
  refsInvalid: number;
  /** Did the first dependency graph contain a cycle (before the automatic repair)? null if stage 5 never finished. */
  cycleBeforeRepair: boolean | null;
  requirements: number | null;
  requirementsCovered: number | null;
  coveragePct: number | null;
  stories: number | null;
  tasks: number | null;
  tasksPerStoryMean: number | null;
  tasksPerStoryMin: number | null;
  tasksPerStoryMax: number | null;
  tasksFlaggedDuplicate: number | null;
  edges: number | null;
  edgesPerTask: number | null;
  cpmHours: number | null;
  inputTokens: number;
  outputTokens: number;
  /** Wall-clock time of the whole run, seconds. */
  runSeconds: number;
}

const INFRA_CODES = new Set(['QUOTA_EXHAUSTED', 'LLM_UNAVAILABLE']);

export function isInfraCode(code: string | null | undefined): boolean {
  return code !== null && code !== undefined && INFRA_CODES.has(code);
}

/** Counts the unknown references named in the harness' semantic error messages. */
export function countInvalidRefs(errors: readonly string[]): number {
  let count = 0;
  for (const error of errors) {
    const ids = /unknown ids ([^.]+)\./.exec(error);
    if (ids?.[1]) {
      count += ids[1].split(',').filter((id) => id.trim() !== '').length;
    } else if (/is not in this batch|unknown epic/.test(error)) {
      count += 1;
    }
  }
  return count;
}

/** Edges dropped by validation, parsed from the stage 5 issues (one issue per edge). */
function droppedEdges(issues: RunFacts['issues']): { dropped: number; invalid: number } {
  let dropped = 0;
  let invalid = 0;
  for (const issue of issues) {
    if (issue.kind === 'unknown_reference') {
      // The cycle repair reports several dropped edges in one issue: "N repaired edge(s) ...".
      const many = /^(\d+) repaired edge/.exec(issue.message);
      const n = many?.[1] ? Number.parseInt(many[1], 10) : 1;
      dropped += n;
      invalid += n;
    } else if (issue.kind === 'self_loop' || issue.kind === 'duplicate_edge') {
      dropped += 1;
    }
  }
  return { dropped, invalid };
}

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

export function computeRunMetrics(
  calls: readonly CallRecord[],
  facts: RunFacts,
  runSeconds: number,
): RunMetrics {
  const quality = calls.filter((c) => c.outcome !== 'infra');
  const infra = calls.filter((c) => c.outcome === 'infra');
  const edgeDrops = droppedEdges(facts.issues);
  const stageFailedByInfra = facts.status === 'failed' && isInfraCode(facts.errorCode) ? 1 : 0;

  const plan = facts.plan;
  const finished = facts.status === 'succeeded' || facts.status === 'needs_resolution';
  const cycleBeforeRepair = finished
    ? facts.status === 'needs_resolution' ||
      facts.issues.some((i) => i.kind === 'cycle' || i.kind === 'cycle_repaired') ||
      calls.some((c) => c.schemaName === 'DependenciesRepair')
    : null;

  let storyStats: Pick<
    RunMetrics,
    'stories' | 'tasksPerStoryMean' | 'tasksPerStoryMin' | 'tasksPerStoryMax'
  > = { stories: null, tasksPerStoryMean: null, tasksPerStoryMin: null, tasksPerStoryMax: null };
  let planStats: Pick<
    RunMetrics,
    | 'requirements'
    | 'requirementsCovered'
    | 'coveragePct'
    | 'tasks'
    | 'tasksFlaggedDuplicate'
    | 'edges'
    | 'edgesPerTask'
    | 'cpmHours'
  > = {
    requirements: null,
    requirementsCovered: null,
    coveragePct: null,
    tasks: null,
    tasksFlaggedDuplicate: null,
    edges: null,
    edgesPerTask: null,
    cpmHours: null,
  };
  if (plan) {
    const perStory = plan.stories.map((s) => s.task_ids.length);
    storyStats = {
      stories: plan.stories.length,
      tasksPerStoryMean: mean(perStory),
      tasksPerStoryMin: perStory.length ? Math.min(...perStory) : null,
      tasksPerStoryMax: perStory.length ? Math.max(...perStory) : null,
    };
    const flagged = new Set<string>();
    for (const pair of findDuplicateTitles(plan.tasks)) {
      flagged.add(pair.a);
      flagged.add(pair.b);
    }
    const reqTotal = plan.requirements.length;
    const reqCovered = plan.requirements.filter((r) => r.task_ids.length > 0).length;
    planStats = {
      requirements: reqTotal,
      requirementsCovered: reqCovered,
      coveragePct: reqTotal === 0 ? null : (100 * reqCovered) / reqTotal,
      tasks: plan.tasks.length,
      tasksFlaggedDuplicate: flagged.size,
      edges: plan.dependencies.length,
      edgesPerTask: plan.tasks.length === 0 ? null : plan.dependencies.length / plan.tasks.length,
      cpmHours: plan.schedule.cpm.duration_hours,
    };
  }

  const callRefs = quality.reduce((a, c) => a + c.refsProposed, 0);
  const callInvalid = quality.reduce((a, c) => a + c.refsInvalid, 0);
  return {
    status: facts.status,
    failedStage: facts.failedStage,
    failureCode: facts.status === 'failed' ? facts.errorCode : null,
    calls: quality.length,
    callsFirstTryValid: quality.filter((c) => c.outcome === 'ok' && c.attempts === 1).length,
    repairRetries: quality.reduce((a, c) => a + Math.max(c.attempts - 1, 0), 0),
    llmRequests: calls.reduce((a, c) => a + c.attempts, 0),
    infraFailedCalls: infra.length,
    stagesRun: Math.max(facts.stagesRun - stageFailedByInfra, 0),
    stagesFailedValidation: Math.max(facts.stagesFailed - stageFailedByInfra, 0),
    stagesStoppedByQuota: stageFailedByInfra,
    // Story->requirement and task->story references come from the semantic checks of every attempt;
    // dependency edges from the kept edges plus the edges validation dropped.
    refsProposed: callRefs + facts.edgesKept + edgeDrops.dropped,
    refsInvalid: callInvalid + edgeDrops.invalid,
    cycleBeforeRepair,
    ...storyStats,
    ...planStats,
    inputTokens: facts.inputTokens,
    outputTokens: facts.outputTokens,
    runSeconds,
  };
}

// ------------------------------------------------------------------ aggregation

export interface Aggregate {
  runsMeasured: number;
  runsSucceeded: number;
  runsStoppedByQuota: number;
  firstTryValidPct: number | null;
  retryRate: number | null;
  stageFailurePct: number | null;
  invalidReferencePct: number | null;
  cycleRatePct: number | null;
  coveragePctMean: number | null;
  coveragePctMin: number | null;
  duplicateTaskPct: number | null;
  tasksPerStoryMean: number | null;
  tasksPerStoryMin: number | null;
  tasksPerStoryMax: number | null;
  edgesPerTaskMean: number | null;
  runSecondsMean: number | null;
  runSecondsMax: number | null;
  inputTokensTotal: number;
  outputTokensTotal: number;
}

const pct = (num: number, den: number): number | null => (den === 0 ? null : (100 * num) / den);

export function aggregate(runs: readonly RunMetrics[]): Aggregate {
  const sum = (pick: (r: RunMetrics) => number) => runs.reduce((a, r) => a + pick(r), 0);
  const succeeded = runs.filter((r) => r.status === 'succeeded');
  const cycleKnown = runs.filter((r) => r.cycleBeforeRepair !== null);
  const coverage = succeeded.map((r) => r.coveragePct).filter((v): v is number => v !== null);
  const tasks = sum((r) => (r.status === 'succeeded' ? (r.tasks ?? 0) : 0));
  const stories = sum((r) => (r.status === 'succeeded' ? (r.stories ?? 0) : 0));
  const edges = sum((r) => (r.status === 'succeeded' ? (r.edges ?? 0) : 0));
  const dup = sum((r) => (r.status === 'succeeded' ? (r.tasksFlaggedDuplicate ?? 0) : 0));
  const perStoryMin = succeeded
    .map((r) => r.tasksPerStoryMin)
    .filter((v): v is number => v !== null);
  const perStoryMax = succeeded
    .map((r) => r.tasksPerStoryMax)
    .filter((v): v is number => v !== null);
  const seconds = runs.filter((r) => r.status === 'succeeded').map((r) => r.runSeconds);
  return {
    runsMeasured: runs.length,
    runsSucceeded: succeeded.length,
    runsStoppedByQuota: runs.filter((r) => r.stagesStoppedByQuota > 0).length,
    firstTryValidPct: pct(
      sum((r) => r.callsFirstTryValid),
      sum((r) => r.calls),
    ),
    retryRate: sum((r) => r.calls) === 0 ? null : sum((r) => r.repairRetries) / sum((r) => r.calls),
    stageFailurePct: pct(
      sum((r) => r.stagesFailedValidation),
      sum((r) => r.stagesRun),
    ),
    invalidReferencePct: pct(
      sum((r) => r.refsInvalid),
      sum((r) => r.refsProposed),
    ),
    cycleRatePct: pct(
      cycleKnown.filter((r) => r.cycleBeforeRepair === true).length,
      cycleKnown.length,
    ),
    coveragePctMean: mean(coverage),
    coveragePctMin: coverage.length ? Math.min(...coverage) : null,
    duplicateTaskPct: pct(dup, tasks),
    tasksPerStoryMean: stories === 0 ? null : tasks / stories,
    tasksPerStoryMin: perStoryMin.length ? Math.min(...perStoryMin) : null,
    tasksPerStoryMax: perStoryMax.length ? Math.max(...perStoryMax) : null,
    edgesPerTaskMean: tasks === 0 ? null : edges / tasks,
    runSecondsMean: mean(seconds),
    runSecondsMax: seconds.length ? Math.max(...seconds) : null,
    inputTokensTotal: sum((r) => r.inputTokens),
    outputTokensTotal: sum((r) => r.outputTokens),
  };
}

/** Coefficient of variation (sample standard deviation / mean). Needs at least 2 values and a non-zero mean. */
export function coefficientOfVariation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  if (m === 0) return null;
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) / m;
}
