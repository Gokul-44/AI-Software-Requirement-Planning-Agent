import type { Plan, PlanRequirement, PlanStory, PlanTask, Signal } from '../api/types';
import { epicColor } from './colors';

type Epic = Plan['epics'][number];
type ScheduleTask = Plan['schedule']['tasks'][number];

/** Lookup tables built once per plan so every tab can trace IDs in O(1). */
export interface PlanIndex {
  tasks: Map<string, PlanTask>;
  stories: Map<string, PlanStory>;
  epics: Map<string, Epic>;
  requirements: Map<string, PlanRequirement>;
  signals: Map<string, Signal>;
  /** From the plan's stored schedule (the baseline, not a what-if scenario). */
  schedule: Map<string, ScheduleTask>;
  epicIndexOfEpic: Map<string, number>;
  epicOfTask: Map<string, Epic>;
  colorOfEpic: (epicId: string) => string;
  colorOfTask: (taskId: string) => string;
  predecessors: Map<string, string[]>;
  successors: Map<string, string[]>;
  criticalIds: Set<string>;
}

export function buildPlanIndex(plan: Plan): PlanIndex {
  const stories = new Map(plan.stories.map((s) => [s.id, s]));
  const epics = new Map(plan.epics.map((e) => [e.id, e]));
  const epicIndexOfEpic = new Map(plan.epics.map((e, i) => [e.id, i]));
  const epicOfTask = new Map<string, Epic>();
  for (const t of plan.tasks) {
    const epic = epics.get(stories.get(t.story_id)?.epic_id ?? '');
    if (epic) epicOfTask.set(t.id, epic);
  }
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const d of plan.dependencies) {
    predecessors.set(d.to, [...(predecessors.get(d.to) ?? []), d.from]);
    successors.set(d.from, [...(successors.get(d.from) ?? []), d.to]);
  }
  const colorOfEpic = (epicId: string) => epicColor(epicIndexOfEpic.get(epicId) ?? 0);
  return {
    tasks: new Map(plan.tasks.map((t) => [t.id, t])),
    stories,
    epics,
    requirements: new Map(plan.requirements.map((r) => [r.id, r])),
    signals: new Map(plan.signals.map((s) => [s.id, s])),
    schedule: new Map(plan.schedule.tasks.map((t) => [t.task_id, t])),
    epicIndexOfEpic,
    epicOfTask,
    colorOfEpic,
    colorOfTask: (taskId) => colorOfEpic(epicOfTask.get(taskId)?.id ?? ''),
    predecessors,
    successors,
    criticalIds: new Set(plan.schedule.tasks.filter((t) => t.critical).map((t) => t.task_id)),
  };
}

/** A short title for a story card or tree row. */
export function storyHeadline(story: PlanStory): string {
  const text = story.i_want.replace(/^to\s+/i, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
