import type { Plan } from '@spm/shared';
import { byCode, storySentence, storyTitle, uniqueSorted } from './common.js';
import { toCsv } from './csv.js';

type Priority = Plan['stories'][number]['priority'];

/** Jira's default priority scheme. The names must exist in the target site. */
const JIRA_PRIORITY: Record<Priority, string> = { must: 'High', should: 'Medium', could: 'Low' };
const PRIORITY_RANK: Record<Priority, number> = { must: 0, should: 1, could: 2 };

export const JIRA_COLUMNS_BEFORE_LABELS = [
  'Issue Id',
  'Parent Id',
  'Issue Type',
  'Summary',
  'Description',
  'Priority',
  'Story Points',
] as const;
export const JIRA_COLUMNS_AFTER_LABELS = ['Blocked By'] as const;

interface Row {
  id: number;
  parent: number | null;
  type: 'Epic' | 'Story' | 'Sub-task';
  summary: string;
  description: string;
  priority: string;
  points: number | null;
  labels: string[];
  blockedBy: string;
}

/**
 * Jira CSV (MASTER_PLAN B1 Issue 7). UNVERIFIED until imported into a Jira Cloud test project:
 * see docs/jira-mapping.md.
 *
 * Rows: all Epics, then all Stories, then all Sub-tasks, each in code order, so a parent always
 * comes before its children. `Issue Id` is a running number and `Parent Id` refers to it.
 * Labels: requirement codes (R-001) and sprint numbers (sprint-1) in repeated `Labels` columns.
 * Sub-tasks list their predecessors in `Blocked By` as text (codes) and again in the description,
 * so the information survives even if the link mapping fails.
 */
export function toJiraCsv(plan: Plan): string {
  const sprintOf = new Map(plan.schedule.tasks.map((t) => [t.task_id, t.sprint]));
  const criticalIds = new Set(plan.schedule.tasks.filter((t) => t.critical).map((t) => t.task_id));
  const blockers = new Map<string, string[]>();
  for (const d of plan.dependencies) {
    const list = blockers.get(d.to) ?? [];
    list.push(d.from);
    blockers.set(d.to, list);
  }

  const epics = [...plan.epics].sort((a, b) => byCode(a.id, b.id));
  const stories = [...plan.stories].sort((a, b) => byCode(a.id, b.id));
  const tasks = [...plan.tasks].sort((a, b) => byCode(a.id, b.id));
  const storyById = new Map(stories.map((s) => [s.id, s]));

  const rows: Row[] = [];
  const idOf = new Map<string, number>();
  const nextId = (code: string): number => {
    const id = rows.length + 1;
    idOf.set(code, id);
    return id;
  };

  for (const epic of epics) {
    const epicStories = stories.filter((s) => s.epic_id === epic.id);
    const top = epicStories.reduce<Priority>(
      (acc, s) => (PRIORITY_RANK[s.priority] < PRIORITY_RANK[acc] ? s.priority : acc),
      'could',
    );
    rows.push({
      id: nextId(epic.id),
      parent: null,
      type: 'Epic',
      summary: `${epic.id} ${epic.title}`,
      description: epic.description,
      priority: JIRA_PRIORITY[epicStories.length > 0 ? top : 'should'],
      points: null,
      labels: uniqueSorted(epicStories.flatMap((s) => s.requirement_ids)),
      blockedBy: '',
    });
  }

  for (const story of stories) {
    const storyTasks = tasks.filter((t) => t.story_id === story.id);
    const sprints = [...new Set(storyTasks.map((t) => sprintOf.get(t.id)))]
      .filter((n): n is number => n !== undefined)
      .sort((a, b) => a - b);
    const criteria =
      story.acceptance_criteria.length > 0
        ? `\n\nAcceptance criteria:\n${story.acceptance_criteria.map((c) => `- ${c}`).join('\n')}`
        : '';
    rows.push({
      id: nextId(story.id),
      parent: idOf.get(story.epic_id) ?? null,
      type: 'Story',
      summary: `${story.id} ${storyTitle(story, 200)}`,
      description: `${storySentence(story)}${criteria}`,
      priority: JIRA_PRIORITY[story.priority],
      points: storyTasks.length > 0 ? storyTasks.reduce((n, t) => n + t.points, 0) : null,
      labels: [...uniqueSorted(story.requirement_ids), ...sprints.map((n) => `sprint-${n}`)],
      blockedBy: '',
    });
  }

  for (const task of tasks) {
    const sprint = sprintOf.get(task.id);
    const preds = uniqueSorted(blockers.get(task.id) ?? []);
    const blocked = preds.length > 0 ? `\n\nBlocked by: ${preds.join(', ')}` : '';
    const priority: Priority = criticalIds.has(task.id)
      ? 'must'
      : (storyById.get(task.story_id)?.priority ?? 'should');
    rows.push({
      id: nextId(task.id),
      parent: idOf.get(task.story_id) ?? null,
      type: 'Sub-task',
      summary: `${task.id} ${task.title}`,
      description: `${task.description}\n\nLayer: ${task.layer}${blocked}`,
      priority: JIRA_PRIORITY[priority],
      points: task.points,
      labels: [
        ...uniqueSorted(task.requirement_ids),
        ...(sprint === undefined ? [] : [`sprint-${sprint}`]),
      ],
      blockedBy: preds.join(', '),
    });
  }

  const labelColumns = Math.max(1, ...rows.map((r) => r.labels.length));
  const header = [
    ...JIRA_COLUMNS_BEFORE_LABELS,
    ...Array.from({ length: labelColumns }, () => 'Labels'),
    ...JIRA_COLUMNS_AFTER_LABELS,
  ];
  const body = rows.map((r) => [
    r.id,
    r.parent,
    r.type,
    r.summary,
    r.description,
    r.priority,
    r.points,
    ...Array.from({ length: labelColumns }, (_, i) => r.labels[i] ?? ''),
    r.blockedBy,
  ]);
  return toCsv([header, ...body]);
}
