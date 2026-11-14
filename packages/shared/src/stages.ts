import { z } from 'zod';
import {
  Layer,
  Points,
  Priority,
  RequirementCategory,
  RequirementId,
  RequirementType,
  SignalId,
  StoryId,
  TaskId,
} from './ids.js';

/**
 * Stage output schemas (design document C4). Every object is strict (additionalProperties: false).
 * The base schemas are context free and convert cleanly to JSON Schema. The `make*Schema`
 * factories add the context dependent rules ("id is in the stamped set").
 */

// ---------------------------------------------------------------- Stage 1
export const RequirementsOutputSchema = z
  .strictObject({
    summary: z.string().min(20).max(600),
    assumptions: z.array(z.string().max(200)).max(10),
    requirements: z
      .array(
        z.strictObject({
          type: RequirementType,
          category: RequirementCategory.optional(),
          text: z.string().min(10).max(300),
          priority: Priority,
        }),
      )
      .min(5)
      .max(25),
  })
  .superRefine((out, ctx) => {
    if (!out.requirements.some((r) => r.type === 'non_functional')) {
      ctx.addIssue({
        code: 'custom',
        message: 'At least one requirement must be non_functional.',
        path: ['requirements'],
      });
    }
    out.requirements.forEach((r, i) => {
      if (r.type === 'non_functional' && r.category === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'category is required when type is non_functional.',
          path: ['requirements', i, 'category'],
        });
      }
    });
  });
export type RequirementsOutput = z.infer<typeof RequirementsOutputSchema>;

// ---------------------------------------------------------------- Stage 2
export const MAX_TOTAL_STORIES = 40;

const StoryOutputSchema = z.strictObject({
  as_a: z.string().max(60),
  i_want: z.string().max(200),
  so_that: z.string().max(200),
  acceptance_criteria: z.array(z.string().max(200)).min(2).max(5),
  priority: Priority,
  requirement_ids: z.array(RequirementId).min(1).max(5),
});

export const StoriesOutputSchema = z
  .strictObject({
    epics: z
      .array(
        z.strictObject({
          title: z.string().max(80),
          description: z.string().max(300),
          stories: z.array(StoryOutputSchema).min(1).max(8),
        }),
      )
      .min(2)
      .max(8),
  })
  .superRefine((out, ctx) => {
    const total = out.epics.reduce((n, e) => n + e.stories.length, 0);
    if (total > MAX_TOTAL_STORIES) {
      ctx.addIssue({
        code: 'custom',
        message: `Total stories (${total}) exceeds ${MAX_TOTAL_STORIES}.`,
        path: ['epics'],
      });
    }
  });
export type StoriesOutput = z.infer<typeof StoriesOutputSchema>;

/** Adds: every requirement_ids entry is in the stamped R set. */
export function makeStoriesOutputSchema(ctx: { requirementIds: Iterable<string> }) {
  const known = new Set(ctx.requirementIds);
  return StoriesOutputSchema.superRefine((out, c) => {
    out.epics.forEach((epic, ei) =>
      epic.stories.forEach((story, si) =>
        story.requirement_ids.forEach((rid, ri) => {
          if (!known.has(rid)) {
            c.addIssue({
              code: 'custom',
              message: `Unknown requirement id ${rid}.`,
              path: ['epics', ei, 'stories', si, 'requirement_ids', ri],
            });
          }
        }),
      ),
    );
  });
}

// ---------------------------------------------------------------- Stage 3
export const MAX_TASKS_PER_STORY = 8;
export const MAX_TOTAL_TASKS = 150;

export const TasksOutputSchema = z
  .strictObject({
    tasks: z
      .array(
        z.strictObject({
          story_id: StoryId,
          title: z.string().min(5).max(100),
          description: z.string().max(300),
          layer: Layer,
        }),
      )
      .min(1)
      .max(60),
  })
  .superRefine((out, ctx) => {
    const perStory = new Map<string, number>();
    for (const t of out.tasks) perStory.set(t.story_id, (perStory.get(t.story_id) ?? 0) + 1);
    for (const [sid, n] of perStory) {
      if (n > MAX_TASKS_PER_STORY) {
        ctx.addIssue({
          code: 'custom',
          message: `Story ${sid} has ${n} tasks; the maximum is ${MAX_TASKS_PER_STORY}.`,
          path: ['tasks'],
        });
      }
    }
  });
export type TasksOutput = z.infer<typeof TasksOutputSchema>;

/** Adds: story_id is in this batch's stories, and every batch story has 1..8 tasks. */
export function makeTasksOutputSchema(ctx: { storyIds: Iterable<string> }) {
  const batch = new Set(ctx.storyIds);
  return TasksOutputSchema.superRefine((out, c) => {
    const seen = new Set<string>();
    out.tasks.forEach((t, i) => {
      seen.add(t.story_id);
      if (!batch.has(t.story_id)) {
        c.addIssue({
          code: 'custom',
          message: `story_id ${t.story_id} is not in this batch.`,
          path: ['tasks', i, 'story_id'],
        });
      }
    });
    for (const sid of batch) {
      if (!seen.has(sid)) {
        c.addIssue({
          code: 'custom',
          message: `Story ${sid} has no tasks.`,
          path: ['tasks'],
        });
      }
    }
  });
}

/** The merged task count across all epic batches must stay within the cap. */
export function checkMergedTaskCount(total: number): string | null {
  return total > MAX_TOTAL_TASKS
    ? `Total tasks (${total}) exceeds ${MAX_TOTAL_TASKS} after merging.`
    : null;
}

// ---------------------------------------------------------------- Stage 4
export const EstimatesOutputSchema = z
  .strictObject({
    estimates: z.array(
      z.strictObject({
        task_id: TaskId,
        points: Points,
        rationale: z.string().max(160),
      }),
    ),
  })
  .superRefine((out, ctx) => {
    const seen = new Set<string>();
    out.estimates.forEach((e, i) => {
      if (seen.has(e.task_id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate estimate for ${e.task_id}.`,
          path: ['estimates', i, 'task_id'],
        });
      }
      seen.add(e.task_id);
    });
  });
export type EstimatesOutput = z.infer<typeof EstimatesOutputSchema>;

/**
 * Pipeline helper: compares the returned task ids with the stamped T set.
 * Missing ids trigger a targeted retry; unknown ids are dropped and logged.
 */
export function diffEstimateIds(
  out: EstimatesOutput,
  stampedTaskIds: Iterable<string>,
): { missing: string[]; unknown: string[] } {
  const expected = new Set(stampedTaskIds);
  const got = new Set(out.estimates.map((e) => e.task_id));
  return {
    missing: [...expected].filter((id) => !got.has(id)),
    unknown: [...got].filter((id) => !expected.has(id)),
  };
}

/** Strict form: the set of task_ids equals the stamped T set exactly. */
export function makeEstimatesOutputSchema(ctx: { taskIds: Iterable<string> }) {
  const stamped = [...ctx.taskIds];
  return EstimatesOutputSchema.superRefine((out, c) => {
    const { missing, unknown } = diffEstimateIds(out, stamped);
    if (missing.length > 0) {
      c.addIssue({
        code: 'custom',
        message: `Missing estimates for: ${missing.join(', ')}.`,
        path: ['estimates'],
      });
    }
    if (unknown.length > 0) {
      c.addIssue({
        code: 'custom',
        message: `Unknown task ids: ${unknown.join(', ')}.`,
        path: ['estimates'],
      });
    }
  });
}

// ---------------------------------------------------------------- Stage 5
/** Semantics: every x in depends_on creates an edge x -> task_id. */
export const DependenciesOutputSchema = z.strictObject({
  dependencies: z.array(
    z.strictObject({
      task_id: TaskId,
      depends_on: z.array(TaskId).min(1).max(5),
      reason: z.string().max(160),
    }),
  ),
});
export type DependenciesOutput = z.infer<typeof DependenciesOutputSchema>;

// ---------------------------------------------------------------- Stage 7
export const RisksOutputSchema = z.strictObject({
  risks: z
    .array(
      z.strictObject({
        title: z.string().max(100),
        description: z.string().max(500),
        mitigation: z.string().max(400),
        signal_ids: z.array(SignalId).min(1),
      }),
    )
    .min(1)
    .max(10),
});
export type RisksOutput = z.infer<typeof RisksOutputSchema>;

/** Adds: signal_ids is a subset of the computed signal set. */
export function makeRisksOutputSchema(ctx: { signalIds: Iterable<string> }) {
  const known = new Set(ctx.signalIds);
  return RisksOutputSchema.superRefine((out, c) => {
    out.risks.forEach((r, ri) =>
      r.signal_ids.forEach((sid, si) => {
        if (!known.has(sid)) {
          c.addIssue({
            code: 'custom',
            message: `Unknown signal id ${sid}.`,
            path: ['risks', ri, 'signal_ids', si],
          });
        }
      }),
    );
  });
}

/** Stage number to schema, for the JSON Schema generator and the LLM harness. */
export const STAGE_OUTPUT_SCHEMAS = {
  1: RequirementsOutputSchema,
  2: StoriesOutputSchema,
  3: TasksOutputSchema,
  4: EstimatesOutputSchema,
  5: DependenciesOutputSchema,
  7: RisksOutputSchema,
} as const;
export type LlmStage = keyof typeof STAGE_OUTPUT_SCHEMAS;
