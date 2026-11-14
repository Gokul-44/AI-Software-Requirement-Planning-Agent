import type { RequirementsOutput, StoriesOutput, TasksOutput } from '@spm/shared';
import type { CoverageStoriesOutput } from './inputs.js';

/**
 * Semantic validators (design document B3.1): what Zod cannot see because it depends on the stage
 * input. Each returns a list of short error strings that the harness feeds back to the model.
 */

const norm = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function validateRequirements(out: RequirementsOutput): string[] {
  const errors: string[] = [];
  const seen = new Map<string, number>();
  out.requirements.forEach((r, i) => {
    const key = norm(r.text);
    const first = seen.get(key);
    if (first !== undefined) {
      errors.push(`requirements.${i}: duplicates requirements.${first}.`);
    } else {
      seen.set(key, i);
    }
  });
  return errors;
}

function unknownIds(ids: readonly string[], known: ReadonlySet<string>): string[] {
  return ids.filter((id) => !known.has(id));
}

export function validateStories(out: StoriesOutput, requirementIds: Iterable<string>): string[] {
  const known = new Set(requirementIds);
  const errors: string[] = [];
  out.epics.forEach((epic, ei) =>
    epic.stories.forEach((story, si) => {
      const bad = unknownIds(story.requirement_ids, known);
      if (bad.length > 0) {
        errors.push(
          `epics.${ei}.stories.${si}.requirement_ids: unknown ids ${bad.join(', ')}. Use only ${[...known].join(', ')}.`,
        );
      }
    }),
  );
  return errors;
}

export function validateCoverageStories(
  out: CoverageStoriesOutput,
  requirementIds: Iterable<string>,
  epicIds: Iterable<string>,
): string[] {
  const known = new Set(requirementIds);
  const epics = new Set(epicIds);
  const errors: string[] = [];
  out.stories.forEach((story, i) => {
    if (!epics.has(story.epic_id)) {
      errors.push(
        `stories.${i}.epic_id: unknown epic ${story.epic_id}. Use one of ${[...epics].join(', ')}.`,
      );
    }
    const bad = unknownIds(story.requirement_ids, known);
    if (bad.length > 0) errors.push(`stories.${i}.requirement_ids: unknown ids ${bad.join(', ')}.`);
  });
  return errors;
}

/** Only checks that every task points at a story of this batch. Missing stories are coverage C2. */
export function validateTasks(out: TasksOutput, storyIds: Iterable<string>): string[] {
  const batch = new Set(storyIds);
  const errors: string[] = [];
  out.tasks.forEach((t, i) => {
    if (!batch.has(t.story_id)) {
      errors.push(
        `tasks.${i}.story_id: ${t.story_id} is not in this batch. Use one of ${[...batch].join(', ')}.`,
      );
    }
  });
  return errors;
}
