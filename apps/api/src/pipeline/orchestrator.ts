import type { Logger } from 'pino';
import {
  RequirementsOutputSchema,
  StoriesOutputSchema,
  TasksOutputSchema,
  checkMergedTaskCount,
} from '@spm/shared';
import type { StageError, StageStatus } from '@spm/shared';
import { StageCallError } from '../llm/harness.js';
import type { Harness, StageCallResult } from '../llm/harness.js';
import {
  PROMPT_VERSIONS,
  stage1System,
  stage1User,
  stage2CoverageSystem,
  stage2CoverageUser,
  stage2System,
  stage2User,
  stage3System,
  stage3User,
} from '../prompts/index.js';
import { STAGE_COUNT } from '../db/repository.js';
import type { IssueDraft, Repository, RunRow, StoryRow, TaskRow } from '../db/repository.js';
import { CoverageStoriesOutputSchema } from './inputs.js';
import type { CoverageInput, Stage1Input, Stage2Input, Stage3Input } from './inputs.js';
import { stampRequirements, stampStoryTree, stampTasks } from './stamping.js';
import type { EpicDraft, TaskDraft } from './stamping.js';
import {
  validateCoverageStories,
  validateRequirements,
  validateStories,
  validateTasks,
} from './semantic.js';

/**
 * The last stage this build runs. Stages 4-8 (estimates, dependencies, schedule, risks, plan
 * assembly) come in Step 6; until then a run that finishes stage 3 is marked `succeeded`.
 */
export const LAST_STAGE = 3;

export const STAGE_BOUNDS = { min_requirements: 5, max_requirements: 25 } as const;

const MAX_OUTPUT_TOKENS = { stage1: 8192, stage2: 16_384, coverage: 8192, stage3: 16_384 } as const;

export interface PipelineDeps {
  repo: Repository;
  harness: Harness;
  logger: Logger;
}

/** What the calls of one stage cost, summed. */
class Tally {
  attempts = 0;
  inputTokens = 0;
  outputTokens = 0;
  llmLatencyMs = 0;
  calls = 0;
  cachedCalls = 0;
  cacheKey: string | null = null;

  addResult(r: StageCallResult<unknown>): void {
    this.calls += 1;
    if (r.cached) this.cachedCalls += 1;
    this.attempts += r.attempts;
    this.inputTokens += r.usage.inputTokens;
    this.outputTokens += r.usage.outputTokens;
    this.llmLatencyMs += r.latencyMs;
    this.cacheKey ??= r.cacheKey;
  }

  addFailure(err: StageCallError): void {
    this.calls += 1;
    this.attempts += err.info.attempts;
    this.inputTokens += err.info.usage.inputTokens;
    this.outputTokens += err.info.usage.outputTokens;
    this.llmLatencyMs += err.info.latencyMs;
    this.cacheKey ??= err.info.cacheKey;
  }

  get allCached(): boolean {
    return this.calls > 0 && this.cachedCalls === this.calls;
  }
}

/** A stage failed in a way that is not a harness error (for example the task cap). */
class StageFailure extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'StageFailure';
  }
}

const storyBrief = (s: StoryRow) => ({
  id: s.code,
  as_a: s.asA,
  i_want: s.iWant,
  so_that: s.soThat,
  acceptance_criteria: s.acceptanceCriteria,
});

/**
 * Asynchronous run orchestrator (MASTER_PLAN N13). `launch` returns at once; the stages run in
 * the background and write their progress to the repository, which the API polls.
 */
export class Pipeline {
  private readonly running = new Map<string, Promise<void>>();

  constructor(private readonly deps: PipelineDeps) {}

  /** Runs in this process (queued or running). Used for the concurrency limit. */
  get activeRuns(): number {
    return this.running.size;
  }

  /** Startup recovery: runs left queued or running by a previous process become failed. */
  async recover(): Promise<string[]> {
    const ids = await this.deps.repo.markInterruptedRuns();
    if (ids.length > 0) this.deps.logger.warn({ runs: ids }, 'marked interrupted runs as failed');
    return ids;
  }

  launch(runId: string): void {
    const task = this.execute(runId)
      .catch((err: unknown) => this.deps.logger.error({ err, runId }, 'pipeline crashed'))
      .finally(() => this.running.delete(runId));
    this.running.set(runId, task);
  }

  /** Resolves when every launched run has finished (tests, graceful shutdown). */
  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled([...this.running.values()]);
  }

  async execute(runId: string): Promise<void> {
    const { repo, logger } = this.deps;
    const run = await repo.getRun(runId);
    if (!run) throw new Error(`Run ${runId} does not exist.`);
    const log = logger.child({ runId });
    await repo.updateRun(runId, { status: 'running' });

    const totals = { input: 0, output: 0 };
    const stages: [number, (run: RunRow, tally: Tally) => Promise<void>][] = [
      [1, (r, t) => this.stage1(r, t)],
      [2, (r, t) => this.stage2(r, t)],
      [3, (r, t) => this.stage3(r, t)],
    ];

    for (const [stage, fn] of stages) {
      if (stage > LAST_STAGE) break;
      const tally = new Tally();
      const started = new Date();
      await repo.updateRun(runId, { currentStage: stage });
      await repo.updateStage(runId, stage, {
        status: 'running',
        startedAt: started,
        finishedAt: null,
        error: null,
      });
      try {
        const fresh = (await repo.getRun(runId)) ?? run;
        await fn(fresh, tally);
      } catch (err) {
        if (err instanceof StageCallError) tally.addFailure(err);
        const failure = describeFailure(stage, err);
        const finished = new Date();
        totals.input += tally.inputTokens;
        totals.output += tally.outputTokens;
        await repo.updateStage(runId, stage, {
          status: 'failed',
          cacheKey: tally.cacheKey,
          attempts: tally.attempts,
          inputTokens: tally.inputTokens,
          outputTokens: tally.outputTokens,
          latencyMs: finished.getTime() - started.getTime(),
          error: failure.stageError,
          finishedAt: finished,
        });
        await repo.updateRun(runId, {
          status: 'failed',
          error: failure.stageError,
          inputTokens: totals.input,
          outputTokens: totals.output,
          finishedAt: finished,
        });
        if (failure.unexpected) log.error({ err, stage }, 'stage crashed');
        else
          log.warn({ stage, code: failure.stageError.details['code'] }, failure.stageError.message);
        return;
      }
      const finished = new Date();
      totals.input += tally.inputTokens;
      totals.output += tally.outputTokens;
      const status: StageStatus = tally.allCached ? 'cached' : 'succeeded';
      await repo.updateStage(runId, stage, {
        status,
        cacheKey: tally.cacheKey,
        attempts: tally.attempts,
        inputTokens: tally.inputTokens,
        outputTokens: tally.outputTokens,
        latencyMs: finished.getTime() - started.getTime(),
        finishedAt: finished,
      });
      await repo.updateRun(runId, { inputTokens: totals.input, outputTokens: totals.output });
      log.info(
        { stage, status, attempts: tally.attempts, ms: finished.getTime() - started.getTime() },
        'stage done',
      );
    }

    await repo.updateRun(runId, { status: 'succeeded', finishedAt: new Date() });
  }

  // ------------------------------------------------------------------ stage 1

  private async stage1(run: RunRow, tally: Tally): Promise<void> {
    const input: Stage1Input = { idea: run.ideaText, bounds: { ...STAGE_BOUNDS } };
    const result = await this.deps.harness.callStage({
      stage: 1,
      promptVersion: PROMPT_VERSIONS[1],
      system: stage1System(input.bounds),
      user: stage1User(input.idea, input.bounds),
      input,
      schema: RequirementsOutputSchema,
      schemaName: 'Requirements',
      semantic: validateRequirements,
      maxOutputTokens: MAX_OUTPUT_TOKENS.stage1,
    });
    tally.addResult(result);
    await this.deps.repo.saveRequirements(run.id, stampRequirements(result.value));
    await this.deps.repo.updateRun(run.id, {
      summary: result.value.summary,
      assumptions: result.value.assumptions,
    });
  }

  // ------------------------------------------------------------------ stage 2

  private async stage2(run: RunRow, tally: Tally): Promise<void> {
    const { repo, harness } = this.deps;
    const core = await repo.loadCore(run.id);
    const summary = run.summary ?? '';
    const briefs = core.requirements.map((r) => ({
      id: r.code,
      type: r.type,
      text: r.text,
      priority: r.priority,
    }));
    const requirementIds = briefs.map((r) => r.id);
    const input: Stage2Input = { summary, requirements: briefs };

    const main = await harness.callStage({
      stage: 2,
      promptVersion: PROMPT_VERSIONS[2],
      system: stage2System(),
      user: stage2User(input),
      input,
      schema: StoriesOutputSchema,
      schemaName: 'Stories',
      semantic: (out) => validateStories(out, requirementIds),
      maxOutputTokens: MAX_OUTPUT_TOKENS.stage2,
    });
    tally.addResult(main);
    const epics: EpicDraft[] = main.value.epics.map((e) => ({ ...e, stories: [...e.stories] }));

    // Coverage C1 (Issue 1): one targeted retry for requirements no story links to.
    let uncovered = requirementsWithoutStory(requirementIds, epics);
    if (uncovered.length > 0) {
      this.deps.logger.info({ runId: run.id, uncovered }, 'coverage C1 failed, one targeted retry');
      const stamped = stampStoryTree(epics);
      const coverageInput: CoverageInput = {
        summary,
        uncovered: briefs.filter((r) => uncovered.includes(r.id)),
        epics: stamped.epics.map((e) => ({
          id: e.code,
          title: e.title,
          story_count: stamped.stories.filter((s) => s.epicCode === e.code).length,
        })),
        all_requirement_ids: requirementIds,
      };
      const epicIds = stamped.epics.map((e) => e.code);
      const extra = await this.targetedRetry(tally, () =>
        harness.callStage({
          stage: 2,
          promptVersion: PROMPT_VERSIONS[2],
          system: stage2CoverageSystem(),
          user: stage2CoverageUser(coverageInput),
          input: coverageInput,
          schema: CoverageStoriesOutputSchema,
          schemaName: 'CoverageStories',
          semantic: (out) => validateCoverageStories(out, requirementIds, epicIds),
          maxOutputTokens: MAX_OUTPUT_TOKENS.coverage,
        }),
      );
      for (const { epic_id, ...story } of extra?.value.stories ?? []) {
        const index = epicIds.indexOf(epic_id);
        epics[index]?.stories.push(story);
      }
      uncovered = requirementsWithoutStory(requirementIds, epics);
    }

    const tree = stampStoryTree(epics);
    const issues: IssueDraft[] = uncovered.map((id) => ({
      stage: 2,
      severity: 'warning',
      kind: 'uncovered_requirement',
      message: `Requirement ${id} has no user story, even after one targeted retry.`,
      refs: [id],
      resolution: null,
    }));
    await repo.saveStoryTree(run.id, tree.epics, tree.stories);
    await repo.replaceIssuesFromStage(run.id, 2, issues);
  }

  // ------------------------------------------------------------------ stage 3

  private async stage3(run: RunRow, tally: Tally): Promise<void> {
    const { repo } = this.deps;
    const core = await repo.loadCore(run.id);
    const summary = run.summary ?? '';
    const drafts: TaskDraft[] = [];

    // One call per epic, one after the other: the free tier allows only a few requests a minute.
    for (const epic of core.epics) {
      const stories = core.stories.filter((s) => s.epicCode === epic.code);
      drafts.push(...(await this.tasksForEpic(summary, epic, stories, tally)));
    }

    // Coverage C2: one targeted retry per epic for stories that received no task.
    const withTasks = new Set(drafts.map((t) => t.story_id));
    for (const epic of core.epics) {
      const missing = core.stories.filter(
        (s) => s.epicCode === epic.code && !withTasks.has(s.code),
      );
      if (missing.length === 0) continue;
      this.deps.logger.info(
        { runId: run.id, stories: missing.map((s) => s.code) },
        'coverage C2 failed, one targeted retry',
      );
      const extra = await this.targetedRetry(tally, () =>
        this.tasksForEpic(summary, epic, missing, tally),
      );
      drafts.push(...(extra ?? []));
    }
    const covered = new Set(drafts.map((t) => t.story_id));
    const stillMissing = core.stories.filter((s) => !covered.has(s.code));

    const tooMany = checkMergedTaskCount(drafts.length);
    if (tooMany)
      throw new StageFailure(tooMany, { code: 'VALIDATION_FAILED', tasks: drafts.length });

    const tasks: TaskRow[] = stampTasks(core.stories, drafts);
    const issues: IssueDraft[] = stillMissing.map((s) => ({
      stage: 3,
      severity: 'warning',
      kind: 'story_without_tasks',
      message: `Story ${s.code} has no task, even after one targeted retry.`,
      refs: [s.code],
      resolution: null,
    }));
    await repo.saveTasks(run.id, tasks);
    await repo.replaceIssuesFromStage(run.id, 3, issues);
  }

  /**
   * A coverage retry is best effort: if it still returns invalid output the gap becomes a
   * warning (never a failed run). Provider outages and quota errors still fail the stage.
   */
  private async targetedRetry<T>(tally: Tally, call: () => Promise<T>): Promise<T | null> {
    try {
      return await call();
    } catch (err) {
      if (err instanceof StageCallError && err.code === 'VALIDATION_FAILED') {
        tally.addFailure(err);
        this.deps.logger.warn(
          { errors: err.info.errors?.slice(0, 5) },
          'targeted retry stayed invalid',
        );
        return null;
      }
      throw err;
    }
  }

  private async tasksForEpic(
    summary: string,
    epic: { code: string; title: string },
    stories: StoryRow[],
    tally: Tally,
  ): Promise<TaskDraft[]> {
    const input: Stage3Input = {
      summary,
      epic: { id: epic.code, title: epic.title },
      stories: stories.map(storyBrief),
    };
    const storyIds = stories.map((s) => s.code);
    const result = await this.deps.harness.callStage({
      stage: 3,
      promptVersion: PROMPT_VERSIONS[3],
      system: stage3System(),
      user: stage3User(input),
      input,
      schema: TasksOutputSchema,
      schemaName: 'Tasks',
      semantic: (out) => validateTasks(out, storyIds),
      maxOutputTokens: MAX_OUTPUT_TOKENS.stage3,
    });
    tally.addResult(result);
    return result.value.tasks;
  }
}

function requirementsWithoutStory(requirementIds: string[], epics: EpicDraft[]): string[] {
  const linked = new Set(epics.flatMap((e) => e.stories.flatMap((s) => s.requirement_ids)));
  return requirementIds.filter((id) => !linked.has(id));
}

function describeFailure(
  stage: number,
  err: unknown,
): { stageError: StageError; unexpected: boolean } {
  const bounded = Math.min(Math.max(stage, 1), STAGE_COUNT);
  if (err instanceof StageCallError) {
    return {
      unexpected: false,
      stageError: {
        stage: bounded,
        code: 'STAGE_FAILED',
        message: err.message,
        details: {
          code: err.code,
          attempts: err.info.attempts,
          ...(err.info.errors ? { errors: err.info.errors.slice(0, 20) } : {}),
        },
      },
    };
  }
  if (err instanceof StageFailure) {
    return {
      unexpected: false,
      stageError: {
        stage: bounded,
        code: 'STAGE_FAILED',
        message: err.message,
        details: err.details,
      },
    };
  }
  return {
    unexpected: true,
    stageError: {
      stage: bounded,
      code: 'STAGE_FAILED',
      message: 'The stage failed because of an internal error.',
      details: { code: 'INTERNAL' },
    },
  };
}
