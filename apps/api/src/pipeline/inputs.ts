import { z } from 'zod';
import {
  EpicId,
  Priority,
  RequirementId,
  RequirementType,
  StoryId,
  StoriesOutputSchema,
} from '@spm/shared';

/**
 * Exact inputs of the LLM stages (MASTER_PLAN B3.3: each stage receives only these fields).
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
