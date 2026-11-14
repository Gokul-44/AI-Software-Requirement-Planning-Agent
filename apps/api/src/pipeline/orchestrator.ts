import type { Logger } from 'pino';
import { ZodError } from 'zod';
import {
  MAX_DUPLICATE_SIGNALS,
  checkAcyclic,
  computeSignals,
  findDuplicateTitles,
  validateEdges,
} from '@spm/scheduler';
import {
  PlanIntegrityError,
  RequirementsOutputSchema,
  RisksOutputSchema,
  StoriesOutputSchema,
  TasksOutputSchema,
  checkMergedTaskCount,
} from '@spm/shared';
import type { PlanRisk, Signal, StageError, StageStatus } from '@spm/shared';
import { StageCallError } from '../llm/harness.js';
import type { Harness } from '../llm/harness.js';
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
  stage7System,
  stage7User,
} from '../prompts/index.js';
import { STAGE_COUNT } from '../db/repository.js';
import type {
  DependencyRow,
  IssueDraft,
  Repository,
  RunRow,
  StoryRow,
  TaskRow,
} from '../db/repository.js';
import { CycleLeftError, assemblePlan, scheduleOrThrow } from './assemble.js';
import { estimateTasks } from './estimates.js';
import {
  cycleInfo,
  cycleIssues,
  edgeKey,
  mergePasses,
  proposeEdges,
  repairCycles,
  repairedIssue,
  suspiciousEdges,
  toIssueDraft,
} from './dependencies.js';
import type { EdgeRef } from './dependencies.js';
import { CoverageStoriesOutputSchema } from './inputs.js';
import type { CoverageInput, Stage1Input, Stage2Input, Stage3Input } from './inputs.js';
import { filterRisks, riskInput, signalsForPrompt, templateRisks, toPlanRisks } from './risks.js';
import type { RiskDraft } from './risks.js';
import { stampRequirements, stampStoryTree, stampTasks } from './stamping.js';
import type { EpicDraft, TaskDraft } from './stamping.js';
import {
  validateCoverageStories,
  validateRequirements,
  validateStories,
  validateTasks,
} from './semantic.js';
import { StageFailure, Tally, bestEffort, tracked } from './support.js';
import type { StageContext } from './support.js';

export const STAGE_BOUNDS = { min_requirements: 5, max_requirements: 25 } as const;

const MAX_OUTPUT_TOKENS = {
  stage1: 8192,
  stage2: 16_384,
  coverage: 8192,
  stage3: 16_384,
  stage7: 8192,
} as const;

export interface PipelineDeps {
  repo: Repository;
  harness: Harness;
  logger: Logger;
}

/** What `execute` does besides running every stage from the start. */
export interface ExecuteOptions {
  /**
   * Re-run (C3): stages before this one were copied from the parent run and are not executed;
   * this stage and later ones ask the model again instead of reading the cache. Stage 7's
   * answer is not stored outside the final plan, so a re-run from stage 8 starts at stage 7
   * and serves it from the cache.
   */
  fromStage?: number;
  /**
   * Retry of a failed run: this stage and later ones keep reading the cache (only successful
   * answers are cached), so a retry after a quota error pays only for the calls that failed.
   */
  reuseCache?: boolean;
  /** Resume after `needs_resolution`: the edges the user chose to remove. Continues at stage 6. */
  resolution?: EdgeRef[];
}

/** Results one stage hands to the next within a single `execute` call. */
interface RunState {
  scheduled: ReturnType<typeof scheduleOrThrow> | null;
  signals: Signal[] | null;
  risks: PlanRisk[] | null;
}

type StageOutcome = 'needs_resolution' | undefined;

/** A harness that ignores the cache, for the stages a re-run redoes. */
const bypassing = (h: Harness): Harness => ({
  callStage: (spec) => h.callStage({ ...spec, bypassCache: true }),
});

const storyBrief = (s: StoryRow) => ({
  id: s.code,
  as_a: s.asA,
  i_want: s.iWant,
  so_that: s.soThat,
  acceptance_criteria: s.acceptanceCriteria,
});

/**
 * Asynchronous run orchestrator (design document N13). `launch` returns at once; the stages run in
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

  launch(runId: string, options: ExecuteOptions = {}): void {
    const task = this.execute(runId, options)
      .catch((err: unknown) => this.deps.logger.error({ err, runId }, 'pipeline crashed'))
      .finally(() => this.running.delete(runId));
    this.running.set(runId, task);
  }

  /** Resolves when every launched run has finished (tests, graceful shutdown). */
  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled([...this.running.values()]);
  }

  async execute(runId: string, options: ExecuteOptions = {}): Promise<void> {
    const { repo, logger } = this.deps;
    const run = await repo.getRun(runId);
    if (!run) throw new Error(`Run ${runId} does not exist.`);
    const log = logger.child({ runId });

    const from = options.fromStage;
    // Stage 7's result is only kept in the final plan, so a re-run "from 8" starts at 7.
    const start = options.resolution ? 6 : Math.min(from ?? 1, 7);
    const freshFrom =
      from !== undefined && from > 1 && options.reuseCache !== true
        ? from
        : Number.POSITIVE_INFINITY;
    const freshHarness = bypassing(this.deps.harness);
    const state: RunState = { scheduled: null, signals: null, risks: null };
    const totals = { input: run.inputTokens, output: run.outputTokens };

    await repo.updateRun(runId, { status: 'running', error: null });

    if (!options.resolution) {
      // Stages before `start` were copied from the parent run: nothing to execute.
      const now = new Date();
      for (let stage = 1; stage < start; stage++) {
        await repo.updateStage(runId, stage, {
          status: 'cached',
          attempts: 0,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
          startedAt: now,
          finishedAt: now,
        });
      }
    } else {
      await repo.updateRun(runId, { currentStage: 5 });
      const blocked = await this.applyResolution(run, options.resolution, log);
      if (blocked) return;
    }

    const stages: [number, (r: RunRow, t: StageContext) => Promise<StageOutcome>][] = [
      [1, (r, c) => this.stage1(r, c)],
      [2, (r, c) => this.stage2(r, c)],
      [3, (r, c) => this.stage3(r, c)],
      [4, (r, c) => this.stage4(r, c)],
      [5, (r, c) => this.stage5(r, c)],
      [6, (r, c) => this.stage6(r, c, state)],
      [7, (r, c) => this.stage7(r, c, state)],
      [8, (r, c) => this.stage8(r, c, state)],
    ];

    for (const [stage, fn] of stages) {
      if (stage < start) continue;
      const tally = new Tally();
      const started = new Date();
      const ctx: StageContext = {
        harness: stage >= freshFrom ? freshHarness : this.deps.harness,
        logger,
        tally,
      };
      await repo.updateRun(runId, { currentStage: stage });
      await repo.updateStage(runId, stage, {
        status: 'running',
        startedAt: started,
        finishedAt: null,
        error: null,
      });
      let outcome: StageOutcome;
      try {
        const fresh = (await repo.getRun(runId)) ?? run;
        outcome = await fn(fresh, ctx);
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
      const common = {
        cacheKey: tally.cacheKey,
        attempts: tally.attempts,
        inputTokens: tally.inputTokens,
        outputTokens: tally.outputTokens,
        latencyMs: finished.getTime() - started.getTime(),
      };
      if (outcome === 'needs_resolution') {
        // The run waits for the user: stage 5 stays "running", the cycle was saved by the stage.
        await repo.updateStage(runId, stage, common);
        await repo.updateRun(runId, {
          status: 'needs_resolution',
          inputTokens: totals.input,
          outputTokens: totals.output,
        });
        log.info({ stage }, 'run waits for a cycle resolution');
        return;
      }
      const status: StageStatus = tally.allCached ? 'cached' : 'succeeded';
      await repo.updateStage(runId, stage, { ...common, status, finishedAt: finished });
      await repo.updateRun(runId, { inputTokens: totals.input, outputTokens: totals.output });
      log.info({ stage, status, attempts: tally.attempts, ms: common.latencyMs }, 'stage done');
    }

    // Stage 8 already marked the run succeeded in the same transaction as the plan.
    await repo.updateRun(runId, { status: 'succeeded' });
  }

  // ------------------------------------------------------------------ stage 1

  private async stage1(run: RunRow, ctx: StageContext): Promise<StageOutcome> {
    const input: Stage1Input = { idea: run.ideaText, bounds: { ...STAGE_BOUNDS } };
    const result = await tracked(ctx, {
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
    await this.deps.repo.saveRequirements(run.id, stampRequirements(result.value));
    await this.deps.repo.updateRun(run.id, {
      summary: result.value.summary,
      assumptions: result.value.assumptions,
    });
    return undefined;
  }

  // ------------------------------------------------------------------ stage 2

  private async stage2(run: RunRow, ctx: StageContext): Promise<StageOutcome> {
    const { repo } = this.deps;
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

    const main = await tracked(ctx, {
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
      const extra = await bestEffort(ctx, () =>
        tracked(ctx, {
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
    return undefined;
  }

  // ------------------------------------------------------------------ stage 3

  private async stage3(run: RunRow, ctx: StageContext): Promise<StageOutcome> {
    const { repo } = this.deps;
    const core = await repo.loadCore(run.id);
    const summary = run.summary ?? '';
    const drafts: TaskDraft[] = [];

    // One call per epic, one after the other: the free tier allows only a few requests a minute.
    for (const epic of core.epics) {
      const stories = core.stories.filter((s) => s.epicCode === epic.code);
      drafts.push(...(await this.tasksForEpic(ctx, summary, epic, stories)));
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
      const extra = await bestEffort(ctx, () => this.tasksForEpic(ctx, summary, epic, missing));
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
    return undefined;
  }

  private async tasksForEpic(
    ctx: StageContext,
    summary: string,
    epic: { code: string; title: string },
    stories: StoryRow[],
  ): Promise<TaskDraft[]> {
    const input: Stage3Input = {
      summary,
      epic: { id: epic.code, title: epic.title },
      stories: stories.map(storyBrief),
    };
    const storyIds = stories.map((s) => s.code);
    const result = await tracked(ctx, {
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
    return result.value.tasks;
  }

  // ------------------------------------------------------------------ stage 4

  private async stage4(run: RunRow, ctx: StageContext): Promise<StageOutcome> {
    const { repo } = this.deps;
    const core = await repo.loadCore(run.id);
    if (core.tasks.length === 0) {
      throw new StageFailure('There are no tasks to estimate.', { code: 'VALIDATION_FAILED' });
    }
    const { rows, issues } = await estimateTasks(
      ctx,
      core.tasks,
      core.stories,
      run.config.points_to_hours,
    );
    await repo.saveEstimates(run.id, rows);
    await repo.replaceIssuesFromStage(run.id, 4, issues);
    return undefined;
  }

  // ------------------------------------------------------------------ stage 5

  /**
   * Dependencies (B3.6) -> validateEdges -> checkAcyclic. A cycle gets ONE re-proposal limited to
   * the cycle's tasks; if it is still cyclic the run waits in `needs_resolution` (D-07).
   */
  private async stage5(run: RunRow, ctx: StageContext): Promise<StageOutcome> {
    const { repo, logger } = this.deps;
    const core = await repo.loadCore(run.id);
    const storyEpic = new Map(core.stories.map((s) => [s.code, s.epicCode]));
    const tasks = core.tasks.map((t) => ({
      id: t.code,
      title: t.title,
      layer: t.layer,
      story_id: t.storyCode,
      epic_id: storyEpic.get(t.storyCode) ?? '',
    }));
    const taskIds = tasks.map((t) => t.id);
    const epics = core.epics.map((e) => ({ id: e.code, title: e.title }));

    const passes = await proposeEdges(ctx, tasks, epics);
    const validated = validateEdges(taskIds, mergePasses(passes));
    let edges: DependencyRow[] = validated.edges;
    const issues: IssueDraft[] = validated.issues.map(toIssueDraft);

    let acyclic = checkAcyclic(taskIds, edges);
    if (!acyclic.ok) {
      logger.info({ runId: run.id, cycles: acyclic.cycles.length }, 'cycle found, one repair call');
      const repair = await repairCycles(ctx, tasks, edges, acyclic.cycles);
      if (repair) {
        edges = repair.edges;
        for (const e of repair.removed) issues.push(repairedIssue(e, 'automatic repair'));
        if (repair.discarded > 0) {
          issues.push({
            stage: 5,
            severity: 'warning',
            kind: 'unknown_reference',
            message: `${repair.discarded} repaired edge(s) did not connect two tasks of the same cycle and were dropped.`,
            refs: [],
            resolution: 'Edges removed.',
          });
        }
        acyclic = checkAcyclic(taskIds, edges);
      }
    }

    const layerOf = new Map(core.tasks.map((t) => [t.code, t.layer]));
    issues.push(...suspiciousEdges(edges, layerOf));

    if (!acyclic.ok) {
      // Still cyclic: keep everything we know and wait for the user (POST .../resolve-cycle).
      issues.push(...cycleIssues(acyclic.cyclePaths));
      await repo.saveDependencies(run.id, edges);
      await repo.replaceIssuesFromStage(run.id, 5, issues);
      await repo.updateRun(run.id, { cycle: cycleInfo(acyclic.cycles, edges) });
      return 'needs_resolution';
    }
    await repo.saveDependencies(run.id, edges);
    await repo.replaceIssuesFromStage(run.id, 5, issues);
    await repo.updateRun(run.id, { cycle: null });
    return undefined;
  }

  /**
   * Applies the edges the user removed. Logs each one as `cycle_repaired`. Returns true when the
   * graph is still cyclic (the run stays in `needs_resolution` with the remaining cycles).
   */
  private async applyResolution(run: RunRow, remove: EdgeRef[], log: Logger): Promise<boolean> {
    const { repo } = this.deps;
    const core = await repo.loadCore(run.id);
    const drop = new Set(remove.map(edgeKey));
    const removed = core.dependencies.filter((e) => drop.has(edgeKey(e)));
    const edges = core.dependencies.filter((e) => !drop.has(edgeKey(e)));
    const kept: IssueDraft[] = core.issues
      .filter((i) => i.stage >= 5 && i.kind !== 'cycle')
      .map(({ code: _code, ...draft }) => draft);
    kept.push(...removed.map((e) => repairedIssue(e, 'the user')));
    log.info({ removed: removed.length }, 'user removed edges to break a cycle');

    const taskIds = core.tasks.map((t) => t.code);
    const acyclic = checkAcyclic(taskIds, edges);
    await repo.saveDependencies(run.id, edges);
    if (!acyclic.ok) {
      await repo.replaceIssuesFromStage(run.id, 5, [...kept, ...cycleIssues(acyclic.cyclePaths)]);
      await repo.updateRun(run.id, {
        status: 'needs_resolution',
        cycle: cycleInfo(acyclic.cycles, edges),
      });
      return true;
    }
    await repo.replaceIssuesFromStage(run.id, 5, kept);
    await repo.updateRun(run.id, { cycle: null });
    await repo.updateStage(run.id, 5, { status: 'succeeded', finishedAt: new Date() });
    return false;
  }

  // ------------------------------------------------------------------ stage 6

  /** schedulePlan (validateEdges, checkAcyclic, CPM, priority order, sprint packing). */
  private async stage6(run: RunRow, _ctx: StageContext, state: RunState): Promise<StageOutcome> {
    const { repo } = this.deps;
    const core = await repo.loadCore(run.id);
    state.scheduled = this.schedule(run, core);

    const pairs = findDuplicateTitles(core.tasks.map((t) => ({ id: t.code, title: t.title })));
    const issues: IssueDraft[] = pairs.slice(0, MAX_DUPLICATE_SIGNALS).map((p) => ({
      stage: 6,
      severity: 'warning',
      kind: 'duplicate_task_suspect',
      message: `${p.a} and ${p.b} have very similar titles (similarity ${p.similarity}).`,
      refs: [p.a, p.b],
      resolution: 'Kept: duplicates are reported, never deleted automatically.',
    }));
    await repo.replaceIssuesFromStage(run.id, 6, issues);
    return undefined;
  }

  private schedule(run: RunRow, core: Awaited<ReturnType<Repository['loadCore']>>) {
    try {
      return scheduleOrThrow(run.config, core);
    } catch (err) {
      if (err instanceof CycleLeftError) {
        throw new StageFailure('The dependency graph still contains a cycle.', {
          code: 'VALIDATION_FAILED',
          cycles: err.cycles,
        });
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------ stage 7

  /**
   * computeSignals, then the risk prompt with the signals only. Risks that cite no signal or an
   * unknown one are rejected; severity is computed by code; template risks fill an empty register.
   */
  private async stage7(run: RunRow, ctx: StageContext, state: RunState): Promise<StageOutcome> {
    const { repo } = this.deps;
    const core = await repo.loadCore(run.id);
    state.scheduled ??= this.schedule(run, core);
    const { scheduled, planCore } = state.scheduled;
    const signals = computeSignals(
      { ...planCore, dependencies: scheduled.dependencies, schedule: scheduled.schedule },
      {},
    );
    state.signals = signals;

    const issues: IssueDraft[] = [];
    let drafts: RiskDraft[] = [];
    if (signals.length > 0) {
      const sent = signalsForPrompt(signals);
      const titleOf = new Map(core.tasks.map((t) => [t.code, t.title]));
      const input = riskInput(run.summary ?? '', sent, titleOf);
      const answer = await bestEffort(ctx, () =>
        tracked(ctx, {
          stage: 7,
          promptVersion: PROMPT_VERSIONS[7],
          system: stage7System(),
          user: stage7User(input),
          input,
          schema: RisksOutputSchema,
          schemaName: 'Risks',
          maxOutputTokens: MAX_OUTPUT_TOKENS.stage7,
        }),
      );
      if (answer === null) {
        issues.push({
          stage: 7,
          severity: 'warning',
          kind: 'risk_rejected',
          message: 'The model returned no valid risk list, so template risks were used.',
          refs: [],
          resolution: 'Template risks, one per top-severity signal.',
        });
      } else {
        const filtered = filterRisks(answer.value, new Set(sent.map((s) => s.id)));
        drafts = filtered.kept;
        issues.push(...filtered.issues);
      }
      if (drafts.length === 0) drafts = templateRisks(signals);
    }
    state.risks = toPlanRisks(drafts, signals);
    await repo.replaceIssuesFromStage(run.id, 7, issues);
    return undefined;
  }

  // ------------------------------------------------------------------ stage 8

  /** Assembles plan.json, validates it and persists everything in one transaction. */
  private async stage8(run: RunRow, _ctx: StageContext, state: RunState): Promise<StageOutcome> {
    const { repo } = this.deps;
    const core = await repo.loadCore(run.id);
    const scheduled = state.scheduled ?? this.schedule(run, core);
    if (state.risks === null || state.signals === null) {
      throw new StageFailure('Stage 7 produced no result.', { code: 'INTERNAL' });
    }
    const stages = await repo.getStages(run.id);
    const usage = {
      inputTokens: stages.reduce((n, s) => n + s.inputTokens, 0),
      outputTokens: stages.reduce((n, s) => n + s.outputTokens, 0),
    };
    const plan = assemblePlan({
      run,
      core,
      scheduled: { ...scheduled.scheduled, signals: state.signals },
      risks: state.risks,
      usage,
      finishedAt: new Date(),
    });
    await repo.savePlan(run.id, plan);
    return undefined;
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
  if (err instanceof PlanIntegrityError || err instanceof ZodError) {
    const problems =
      err instanceof PlanIntegrityError
        ? [...err.problems]
        : err.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    return {
      unexpected: false,
      stageError: {
        stage: bounded,
        code: 'STAGE_FAILED',
        message: 'The assembled plan failed validation.',
        details: { code: 'VALIDATION_FAILED', problems: problems.slice(0, 20) },
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
