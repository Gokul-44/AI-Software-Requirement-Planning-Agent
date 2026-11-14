import { schedulePlan } from '@spm/scheduler';
import type { PlanCore, SchedulePlanResult } from '@spm/scheduler';
import { PLAN_SCHEMA_VERSION, PlanSchema, assertPlanIntegrity } from '@spm/shared';
import type { Config, Plan, PlanRisk, Points } from '@spm/shared';
import type { DependencyRow, IssueRow, RunRow } from '../db/repository.js';
import type { EpicRow, RequirementRow, StoryRow, TaskRow } from '../db/repository.js';

export interface CoreData {
  requirements: RequirementRow[];
  epics: EpicRow[];
  stories: StoryRow[];
  tasks: TaskRow[];
  dependencies: DependencyRow[];
  issues: IssueRow[];
}

type Scheduled = Extract<SchedulePlanResult, { ok: true }>;

const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function pointsOf(t: TaskRow): Points {
  if (t.points === null || t.points === undefined) {
    throw new Error(`Task ${t.code} has no estimate yet.`);
  }
  return t.points;
}

/** Hours are always recomputed from points and the run's config, so a changed config applies. */
export function hoursFor(points: Points, config: Config): number {
  return config.points_to_hours[String(points) as keyof Config['points_to_hours']];
}

/** What the scheduler needs. Edges removed during cycle repair feed the `cycle_repaired` signal. */
export function buildPlanCore(config: Config, core: CoreData): PlanCore {
  const repaired = core.issues
    .filter((i) => i.kind === 'cycle_repaired' && i.refs.length === 2)
    .map((i) => ({ from: i.refs[0] as string, to: i.refs[1] as string }));
  return {
    requirements: core.requirements.map((r) => ({ id: r.code, priority: r.priority })),
    stories: core.stories.map((s) => ({ id: s.code, requirement_ids: s.requirementCodes })),
    tasks: core.tasks.map((t) => {
      const points = pointsOf(t);
      return {
        id: t.code,
        story_id: t.storyCode,
        title: t.title,
        layer: t.layer,
        points,
        hours: hoursFor(points, config),
      };
    }),
    dependencies: core.dependencies.map((d) => ({ from: d.from, to: d.to })),
    repaired_edges: repaired,
  };
}

export class CycleLeftError extends Error {
  constructor(readonly cycles: string[][]) {
    super(`The dependency graph still has ${cycles.length} cycle(s).`);
    this.name = 'CycleLeftError';
  }
}

/** Stage 6: validateEdges, checkAcyclic, CPM, priority order and sprint packing (one entry point). */
export function scheduleOrThrow(
  config: Config,
  core: CoreData,
): { scheduled: Scheduled; planCore: PlanCore } {
  const planCore = buildPlanCore(config, core);
  const result = schedulePlan(planCore, config);
  if (!result.ok) throw new CycleLeftError(result.cycles);
  return { scheduled: result, planCore };
}

export interface AssembleInput {
  run: RunRow;
  core: CoreData;
  scheduled: Scheduled;
  risks: PlanRisk[];
  usage: { inputTokens: number; outputTokens: number };
  finishedAt: Date;
}

/**
 * Stage 8 (design document C5): builds plan.json from the persisted stage results, then validates it
 * with PlanSchema and assertPlanIntegrity. Throws when the plan is not sound.
 */
export function assemblePlan(input: AssembleInput): Plan {
  const { run, core, scheduled, risks, usage, finishedAt } = input;
  const storyReqs = new Map(
    core.stories.map((s) => [s.code, [...s.requirementCodes].sort(byCode)]),
  );

  const tasks: Plan['tasks'] = core.tasks.map((t) => {
    const points = pointsOf(t);
    return {
      id: t.code,
      story_id: t.storyCode,
      title: t.title,
      description: t.description,
      layer: t.layer,
      points,
      hours: hoursFor(points, run.config),
      estimate_rationale: t.rationale ?? '',
      requirement_ids: storyReqs.get(t.storyCode) ?? [],
    };
  });
  const stories: Plan['stories'] = core.stories.map((s) => ({
    id: s.code,
    epic_id: s.epicCode,
    as_a: s.asA,
    i_want: s.iWant,
    so_that: s.soThat,
    acceptance_criteria: s.acceptanceCriteria,
    priority: s.priority,
    requirement_ids: storyReqs.get(s.code) ?? [],
    task_ids: tasks.filter((t) => t.story_id === s.code).map((t) => t.id),
  }));
  const epics: Plan['epics'] = core.epics.map((e) => ({
    id: e.code,
    title: e.title,
    description: e.description,
    story_ids: stories.filter((s) => s.epic_id === e.code).map((s) => s.id),
  }));
  const requirements: Plan['requirements'] = core.requirements.map((r) => ({
    id: r.code,
    type: r.type,
    category: r.category,
    text: r.text,
    priority: r.priority,
    story_ids: stories.filter((s) => s.requirement_ids.includes(r.code)).map((s) => s.id),
    task_ids: tasks.filter((t) => t.requirement_ids.includes(r.code)).map((t) => t.id),
  }));

  const reasons = new Map(core.dependencies.map((d) => [`${d.from}->${d.to}`, d]));
  const dependencies: Plan['dependencies'] = scheduled.dependencies.map((e) => {
    const row = reasons.get(`${e.from}->${e.to}`);
    return {
      from: e.from,
      to: e.to,
      type: 'FS',
      source: row?.source ?? 'llm',
      reason: row?.reason ?? null,
    };
  });

  const plan: Plan = {
    schema_version: PLAN_SCHEMA_VERSION,
    project: {
      id: run.projectId,
      idea_text: run.ideaText,
      created_at: run.projectCreatedAt.toISOString(),
    },
    run: {
      id: run.id,
      status: 'succeeded',
      created_at: run.createdAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      llm: {
        provider: run.llmProvider,
        model: run.llmModel,
        prompt_versions: run.promptVersions,
      },
      config: run.config,
      usage: {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        est_cost_usd: run.estCostUsd,
        duration_ms: Math.max(0, finishedAt.getTime() - run.createdAt.getTime()),
      },
    },
    summary: run.summary ?? '',
    assumptions: run.assumptions,
    requirements,
    epics,
    stories,
    tasks,
    dependencies,
    schedule: scheduled.schedule,
    signals: scheduled.signals,
    risks,
    coverage: scheduled.coverage,
    issues: core.issues.map((i) => ({
      id: i.code,
      stage: Math.min(Math.max(i.stage, 1), 8),
      severity: i.severity,
      kind: i.kind,
      message: i.message,
      refs: i.refs,
      resolution: i.resolution,
    })),
  };

  const valid = PlanSchema.parse(plan);
  assertPlanIntegrity(valid);
  return valid;
}
