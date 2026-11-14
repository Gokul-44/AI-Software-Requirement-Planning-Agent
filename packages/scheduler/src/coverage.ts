import type { Coverage, PlanCore } from './types.js';

type CoverageInput = Pick<PlanCore, 'requirements' | 'stories' | 'tasks'>;

/** C1: requirements that no story links to (input order). */
export function requirementsWithoutStory(core: CoverageInput): string[] {
  const linked = new Set(core.stories.flatMap((s) => s.requirement_ids));
  return core.requirements.map((r) => r.id).filter((id) => !linked.has(id));
}

/** C2: stories that have no task (input order). */
export function storiesWithoutTasks(core: CoverageInput): string[] {
  const withTasks = new Set(core.tasks.map((t) => t.story_id));
  return core.stories.map((s) => s.id).filter((id) => !withTasks.has(id));
}

/** C3 (warning only): requirements with no task through any of their stories (input order). */
export function requirementsWithoutTask(core: CoverageInput): string[] {
  const storiesWithTasks = new Set(core.tasks.map((t) => t.story_id));
  const traced = new Set(
    core.stories.filter((s) => storiesWithTasks.has(s.id)).flatMap((s) => s.requirement_ids),
  );
  return core.requirements.map((r) => r.id).filter((id) => !traced.has(id));
}

/** The `coverage` block of plan.json. A requirement is uncovered if C1 or C3 fails for it. */
export function computeCoverage(core: CoverageInput): Coverage {
  const noStory = new Set(requirementsWithoutStory(core));
  const noTask = new Set(requirementsWithoutTask(core));
  const total = core.requirements.length;
  return {
    requirements_total: total,
    requirements_with_story: total - noStory.size,
    requirements_with_task: total - noTask.size,
    uncovered_requirement_ids: core.requirements
      .map((r) => r.id)
      .filter((id) => noStory.has(id) || noTask.has(id)),
    stories_without_tasks: storiesWithoutTasks(core),
  };
}
