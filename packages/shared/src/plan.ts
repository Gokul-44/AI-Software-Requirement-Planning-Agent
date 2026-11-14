import { z } from 'zod';
import { ConfigSchema } from './config.js';
import {
  EpicId,
  IssueId,
  Layer,
  Points,
  Priority,
  RequirementCategory,
  RequirementId,
  RequirementType,
  RiskId,
  Severity3,
  SignalId,
  StoryId,
  TaskId,
} from './ids.js';

/** plan.json contract, version 1.0 (design document C5). */
export const PLAN_SCHEMA_VERSION = '1.0';

export const RunStatusValue = z.enum([
  'queued',
  'running',
  'needs_resolution',
  'succeeded',
  'failed',
]);
export type RunStatusValue = z.infer<typeof RunStatusValue>;

export const SIGNAL_KINDS = [
  'critical_path_length',
  'critical_high_fanout',
  'high_fan_in',
  'sprint_overload',
  'sprint_imbalance',
  'capacity_bound',
  'isolated_task',
  'layer_anomaly',
  'layer_imbalance',
  'uncovered_requirement',
  'oversized_task',
  'cycle_repaired',
  'duplicate_task_suspect',
  'critical_layer_concentration',
] as const;
export const SignalKind = z.enum(SIGNAL_KINDS);
export type SignalKind = z.infer<typeof SignalKind>;

export const ISSUE_KINDS = [
  'unknown_reference',
  'self_loop',
  'duplicate_edge',
  'cycle',
  'cycle_repaired',
  'uncovered_requirement',
  'story_without_tasks',
  'oversized_task',
  'suspicious_edge',
  'duplicate_task_suspect',
  'risk_rejected',
  'missing_estimate',
] as const;
export const IssueKind = z.enum(ISSUE_KINDS);
export type IssueKind = z.infer<typeof IssueKind>;

/** A computed risk signal (code, never the LLM). */
export const SignalSchema = z.strictObject({
  id: SignalId,
  kind: SignalKind,
  severity: Severity3,
  value: z.number(),
  threshold: z.number().nullable(),
  task_ids: z.array(TaskId),
  message: z.string(),
});
export type Signal = z.infer<typeof SignalSchema>;

/** A validation defect or warning surfaced in the plan. */
export const IssueSchema = z.strictObject({
  id: IssueId,
  stage: z.number().int().min(1).max(8),
  severity: z.enum(['error', 'warning', 'info']),
  kind: IssueKind,
  message: z.string(),
  /** Free-form references. May name ids that do not exist (for example a dropped edge). */
  refs: z.array(z.string()),
  resolution: z.string().nullable(),
});
export type Issue = z.infer<typeof IssueSchema>;

const IsoDateTime = z.iso.datetime({ offset: true });

export const PlanRequirementSchema = z.strictObject({
  id: RequirementId,
  type: RequirementType,
  category: RequirementCategory.nullable(),
  text: z.string(),
  priority: Priority,
  story_ids: z.array(StoryId),
  task_ids: z.array(TaskId),
});

export const PlanEpicSchema = z.strictObject({
  id: EpicId,
  title: z.string(),
  description: z.string(),
  story_ids: z.array(StoryId),
});

export const PlanStorySchema = z.strictObject({
  id: StoryId,
  epic_id: EpicId,
  as_a: z.string(),
  i_want: z.string(),
  so_that: z.string(),
  acceptance_criteria: z.array(z.string()),
  priority: Priority,
  requirement_ids: z.array(RequirementId),
  task_ids: z.array(TaskId),
});

export const PlanTaskSchema = z.strictObject({
  id: TaskId,
  story_id: StoryId,
  title: z.string(),
  description: z.string(),
  layer: Layer,
  points: Points,
  hours: z.number().int().positive(),
  estimate_rationale: z.string(),
  requirement_ids: z.array(RequirementId),
});

export const PlanDependencySchema = z.strictObject({
  from: TaskId,
  to: TaskId,
  type: z.literal('FS'),
  source: z.enum(['llm', 'repair', 'user']),
  reason: z.string().nullable(),
});

export const ScheduleTaskSchema = z.strictObject({
  task_id: TaskId,
  es: z.number().int().min(0),
  ef: z.number().int(),
  ls: z.number().int(),
  lf: z.number().int(),
  slack: z.number().int().min(0),
  critical: z.boolean(),
  sprint: z.number().int().min(1),
  planned_start: z.number().int().min(0),
  planned_finish: z.number().int(),
  descendants: z.number().int().min(0),
});

export const SprintSchema = z.strictObject({
  number: z.number().int().min(1),
  load_points: z.number().int().min(0),
  capacity_points: z.number().int().min(1),
  utilisation: z.number().min(0),
  task_ids: z.array(TaskId),
});

export const ScheduleSchema = z.strictObject({
  unit: z.literal('hours'),
  cpm: z.strictObject({
    duration_hours: z.number().min(0),
    duration_days: z.number().min(0),
    critical_path: z.array(TaskId),
  }),
  capacity_plan: z.strictObject({
    sprint_count: z.number().int().min(0),
    duration_days: z.number().min(0),
    capacity_points_per_sprint: z.number().int().min(1),
    hours_per_sprint: z.number().min(1),
  }),
  tasks: z.array(ScheduleTaskSchema),
  sprints: z.array(SprintSchema),
});

export const PlanRiskSchema = z.strictObject({
  id: RiskId,
  severity: Severity3,
  title: z.string(),
  description: z.string(),
  mitigation: z.string(),
  signal_ids: z.array(SignalId).min(1),
  origin: z.enum(['llm', 'template']),
});

export const CoverageSchema = z.strictObject({
  requirements_total: z.number().int().min(0),
  requirements_with_story: z.number().int().min(0),
  requirements_with_task: z.number().int().min(0),
  uncovered_requirement_ids: z.array(RequirementId),
  stories_without_tasks: z.array(StoryId),
});

export const PlanSchema = z.strictObject({
  schema_version: z.literal(PLAN_SCHEMA_VERSION),
  project: z.strictObject({
    id: z.uuid(),
    idea_text: z.string(),
    created_at: IsoDateTime,
  }),
  run: z.strictObject({
    id: z.uuid(),
    status: RunStatusValue,
    created_at: IsoDateTime,
    finished_at: IsoDateTime.nullable(),
    llm: z.strictObject({
      provider: z.string(),
      model: z.string(),
      /** Keyed by stage number as a string ("1", "2", "3", "4", "5", "7"). */
      prompt_versions: z.record(z.string().regex(/^[1-8]$/), z.string()),
    }),
    config: ConfigSchema,
    usage: z.strictObject({
      input_tokens: z.number().int().min(0),
      output_tokens: z.number().int().min(0),
      est_cost_usd: z.number().min(0),
      duration_ms: z.number().int().min(0),
    }),
  }),
  summary: z.string(),
  assumptions: z.array(z.string()),
  requirements: z.array(PlanRequirementSchema),
  epics: z.array(PlanEpicSchema),
  stories: z.array(PlanStorySchema),
  tasks: z.array(PlanTaskSchema),
  dependencies: z.array(PlanDependencySchema),
  schedule: ScheduleSchema,
  signals: z.array(SignalSchema),
  risks: z.array(PlanRiskSchema),
  coverage: CoverageSchema,
  issues: z.array(IssueSchema),
});
export type Plan = z.infer<typeof PlanSchema>;
export type PlanTask = z.infer<typeof PlanTaskSchema>;
export type PlanStory = z.infer<typeof PlanStorySchema>;
export type PlanRequirement = z.infer<typeof PlanRequirementSchema>;
export type PlanDependency = z.infer<typeof PlanDependencySchema>;
export type PlanRisk = z.infer<typeof PlanRiskSchema>;
