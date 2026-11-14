import type { Logger } from 'pino';
import { DEFAULT_CONFIG, PlanSchema } from '@spm/shared';
import type { Repository } from '../db/repository.js';
import type { Harness } from '../llm/harness.js';
import type { LlmClient } from '../llm/types.js';
import { Pipeline } from '../pipeline/orchestrator.js';
import { PROMPT_VERSIONS } from '../prompts/index.js';
import { computeRunMetrics } from './metrics.js';
import type { RunFacts, RunMetrics } from './metrics.js';
import { RecordingHarness } from './recorder.js';

export interface EvalIdea {
  id: number;
  slug: string;
  idea: string;
  note?: string | undefined;
}

export interface EvalRunResult {
  idea: EvalIdea;
  /** 1 for the first run of an idea, 2.. for repeats. */
  repeat: number;
  runId: string;
  metrics: RunMetrics;
}

export interface PlannedRun {
  idea: EvalIdea;
  repeat: number;
}

/**
 * The runs in the order they are made: every selected idea once (breadth first, so a used-up
 * quota still leaves the widest sample), then the extra repeats of the first idea.
 */
export function planRuns(
  ideas: readonly EvalIdea[],
  options: { limit: number; repeatFirst: number },
): PlannedRun[] {
  const chosen = ideas.slice(0, Math.max(options.limit, 0));
  const runs: PlannedRun[] = chosen.map((idea) => ({ idea, repeat: 1 }));
  const first = chosen[0];
  if (first) {
    for (let repeat = 2; repeat <= options.repeatFirst; repeat++)
      runs.push({ idea: first, repeat });
  }
  return runs;
}

export interface RunEvalOptions {
  repo: Repository;
  llm: LlmClient;
  harness: Harness;
  logger: Logger;
  planned: readonly PlannedRun[];
  /** Called after every finished run, so partial results are written even if a later run crashes. */
  onResult?: (result: EvalRunResult) => void | Promise<void>;
  /** Called before every run. */
  onStart?: (run: PlannedRun, index: number, total: number) => void;
  /** Stop after this many consecutive runs cut off by a provider outage (not quota). */
  maxConsecutiveOutages?: number;
}

export interface RunEvalOutcome {
  results: EvalRunResult[];
  /** Runs that were not started because the free quota ran out (or the provider kept failing). */
  notRun: PlannedRun[];
  stopReason: 'done' | 'quota_exhausted' | 'provider_outages';
}

/**
 * Runs the planned ideas one after the other through the real pipeline (cache off) and measures
 * each run. Stops at the first run that hits the free quota: it never retries, so no further
 * model call is spent once the quota is gone.
 */
export async function runEval(opts: RunEvalOptions): Promise<RunEvalOutcome> {
  const { repo, llm, logger } = opts;
  const recorder = new RecordingHarness(opts.harness);
  const pipeline = new Pipeline({ repo, harness: recorder, logger });
  const results: EvalRunResult[] = [];
  let outages = 0;
  const maxOutages = opts.maxConsecutiveOutages ?? 2;

  for (const [index, planned] of opts.planned.entries()) {
    opts.onStart?.(planned, index, opts.planned.length);
    recorder.reset();
    const { runId } = await repo.createProjectWithRun({
      ideaText: planned.idea.idea,
      config: DEFAULT_CONFIG,
      llmProvider: llm.provider,
      llmModel: llm.model,
      promptVersions: Object.fromEntries(Object.entries(PROMPT_VERSIONS)),
    });
    const started = performance.now();
    await pipeline.execute(runId);
    const seconds = (performance.now() - started) / 1000;

    const facts = await collectFacts(repo, runId);
    const metrics = computeRunMetrics(recorder.calls, facts, seconds);
    const result: EvalRunResult = { idea: planned.idea, repeat: planned.repeat, runId, metrics };
    results.push(result);
    await opts.onResult?.(result);

    if (facts.errorCode === 'QUOTA_EXHAUSTED') {
      return { results, notRun: opts.planned.slice(index + 1), stopReason: 'quota_exhausted' };
    }
    outages = facts.errorCode === 'LLM_UNAVAILABLE' ? outages + 1 : 0;
    if (outages >= maxOutages) {
      return { results, notRun: opts.planned.slice(index + 1), stopReason: 'provider_outages' };
    }
  }
  return { results, notRun: [], stopReason: 'done' };
}

async function collectFacts(repo: Repository, runId: string): Promise<RunFacts> {
  const run = await repo.getRun(runId);
  if (!run) throw new Error(`Run ${runId} vanished.`);
  const stages = await repo.getStages(runId);
  const core = await repo.loadCore(runId);
  const code = run.error?.details?.['code'];
  const parsed = PlanSchema.safeParse(run.plan);
  return {
    status: run.status,
    failedStage: run.error?.stage ?? null,
    errorCode: typeof code === 'string' ? code : null,
    stagesRun: stages.filter((s) => s.status !== 'pending').length,
    stagesFailed: stages.filter((s) => s.status === 'failed').length,
    issues: core.issues.map((i) => ({ kind: i.kind, message: i.message })),
    edgesKept: core.dependencies.filter((d) => d.source === 'llm').length,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    plan: parsed.success ? parsed.data : null,
  };
}
