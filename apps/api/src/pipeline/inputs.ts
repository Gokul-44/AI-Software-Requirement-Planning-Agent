import { z } from 'zod';
import {
  EpicId,
  Layer,
  Priority,
  RequirementId,
  RequirementType,
  Severity3,
  SignalId,
  SignalKind,
  StoryId,
  StoriesOutputSchema,
  TaskId,
} from '@spm/shared';

/**
 * Exact inputs of the LLM stages (design document B3.3: each stage receives only these fields).
 * They are hashed into the cache key and read by the mock provider.
 */
export const Stage1InputSchema = z.object({
  idea: z.string(),
  bounds: z.object({ min_requirements: z.number(), max_requirements: z.number() }),
});
export type Stage1Input = z.infer<typeof Stage1InputSchema>;

const RequirementBriefSchema = z.object({
  id: RequirementId,
  type: RequirementType,
  text: z.string(),
  priority: Priority,
});
export type RequirementBrief = z.infer<typeof RequirementBriefSchema>;

export const Stage2InputSchema = z.object({
  summary: z.string(),
  requirements: z.array(RequirementBriefSchema),
});
export type Stage2Input = z.infer<typeof Stage2InputSchema>;

/** Targeted retry for coverage C1: only the uncovered requirements and the epics to attach to. */
export const CoverageInputSchema = z.object({
  summary: z.string(),
  uncovered: z.array(RequirementBriefSchema),
  epics: z.array(z.object({ id: EpicId, title: z.string(), story_count: z.number() })),
  all_requirement_ids: z.array(RequirementId),
});
export type CoverageInput = z.infer<typeof CoverageInputSchema>;

const StoryBriefSchema = z.object({
  id: StoryId,
  as_a: z.string(),
  i_want: z.string(),
  so_that: z.string(),
  acceptance_criteria: z.array(z.string()),
});
export type StoryBrief = z.infer<typeof StoryBriefSchema>;

export const Stage3InputSchema = z.object({
  summary: z.string(),
  epic: z.object({ id: EpicId, title: z.string() }),
  stories: z.array(StoryBriefSchema),
});
export type Stage3Input = z.infer<typeof Stage3InputSchema>;

/** Output of the coverage retry: extra stories, each attached to an existing epic. */
const StoryItem = StoriesOutputSchema.shape.epics.element.shape.stories.element;
export const CoverageStoriesOutputSchema = z.strictObject({
  stories: z
    .array(
      z.strictObject({
        epic_id: EpicId,
        ...StoryItem.shape,
      }),
    )
    .min(1)
    .max(12),
});
export type CoverageStoriesOutput = z.infer<typeof CoverageStoriesOutputSchema>;

// ---------------------------------------------------------------- stage 4

/** Estimation input (B3.3): code, title, layer and the story's "I want" (at most 120 characters). */
export const Stage4InputSchema = z.object({
  tasks: z.array(z.object({ id: TaskId, title: z.string(), layer: Layer, story: z.string() })),
});
export type Stage4Input = z.infer<typeof Stage4InputSchema>;

// ---------------------------------------------------------------- stage 5

const DependencyTaskSchema = z.object({
  id: TaskId,
  title: z.string(),
  layer: Layer,
  story_id: StoryId,
  epic_id: EpicId,
});
export type DependencyTask = z.infer<typeof DependencyTaskSchema>;

/**
 * scope "all": every task, one call (80 tasks or fewer). "epic": the tasks of one epic
 * (pass A above 80 tasks). "cross": every task, only edges between epics (pass B).
 */
export const DependencyScope = z.enum(['all', 'epic', 'cross']);
export type DependencyScope = z.infer<typeof DependencyScope>;

export const Stage5InputSchema = z.object({
  scope: DependencyScope,
  tasks: z.array(DependencyTaskSchema),
  epics: z.array(z.object({ id: EpicId, title: z.string() })),
});
export type Stage5Input = z.infer<typeof Stage5InputSchema>;

/** Cycle repair (B1 Issue 3): only the tasks and the edges inside each SCC. */
export const Stage5RepairInputSchema = z.object({
  groups: z.array(
    z.object({
      tasks: z.array(z.object({ id: TaskId, title: z.string(), layer: Layer })),
      dependencies: z.array(z.object({ task_id: TaskId, depends_on: z.array(TaskId) })),
    }),
  ),
});
export type Stage5RepairInput = z.infer<typeof Stage5RepairInputSchema>;

// ---------------------------------------------------------------- stage 7

export const Stage7InputSchema = z.object({
  summary: z.string(),
  signals: z.array(
    z.object({
      id: SignalId,
      kind: SignalKind,
      severity: Severity3,
      message: z.string(),
      value: z.number(),
      task_ids: z.array(TaskId),
    }),
  ),
  /** Titles of the tasks the signals name. */
  task_titles: z.record(z.string(), z.string()),
});
export type Stage7Input = z.infer<typeof Stage7InputSchema>;
