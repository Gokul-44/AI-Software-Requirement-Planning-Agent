import type { Plan } from '../api/types';

type Schedule = Plan['schedule'];

/** One row of the tasks table: the task joined with its epic and schedule fields. */
export interface TaskRow {
  id: string;
  title: string;
  epicId: string;
  epicTitle: string;
  storyId: string;
  layer: string;
  points: number;
  hours: number;
  sprint: number;
  slack: number;
  critical: boolean;
  descendants: number;
}

export type SortKey = keyof Pick<
  TaskRow,
  | 'id'
  | 'title'
  | 'epicTitle'
  | 'storyId'
  | 'layer'
  | 'points'
  | 'hours'
  | 'sprint'
  | 'slack'
  | 'critical'
>;
export type SortDir = 'asc' | 'desc';

export interface TaskFilters {
  epic: string; // epic id or '' for all
  layer: string; // layer or '' for all
  criticalOnly: boolean;
  query: string;
}

export const NO_FILTERS: TaskFilters = { epic: '', layer: '', criticalOnly: false, query: '' };

export function buildTaskRows(plan: Plan, schedule: Schedule): TaskRow[] {
  const storyEpic = new Map(plan.stories.map((s) => [s.id, s.epic_id]));
  const epicTitle = new Map(plan.epics.map((e) => [e.id, e.title]));
  const sched = new Map(schedule.tasks.map((t) => [t.task_id, t]));
  return plan.tasks.map((t) => {
    const s = sched.get(t.id);
    const epicId = storyEpic.get(t.story_id) ?? '';
    return {
      id: t.id,
      title: t.title,
      epicId,
      epicTitle: epicTitle.get(epicId) ?? '',
      storyId: t.story_id,
      layer: t.layer,
      points: t.points,
      hours: t.hours,
      sprint: s?.sprint ?? 0,
      slack: s?.slack ?? 0,
      critical: s?.critical ?? false,
      descendants: s?.descendants ?? 0,
    };
  });
}

export function filterTasks(rows: TaskRow[], f: TaskFilters): TaskRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (f.epic === '' || r.epicId === f.epic) &&
      (f.layer === '' || r.layer === f.layer) &&
      (!f.criticalOnly || r.critical) &&
      (q === '' || r.id.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)),
  );
}

function compare(a: TaskRow, b: TaskRow, key: SortKey): number {
  const x = a[key];
  const y = b[key];
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  if (typeof x === 'boolean' && typeof y === 'boolean') return Number(x) - Number(y);
  return String(x).localeCompare(String(y), undefined, { numeric: true });
}

/** Stable sort; ties fall back to the task id so the order never jumps around. */
export function sortTasks(rows: TaskRow[], key: SortKey, dir: SortDir): TaskRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort(
    (a, b) => sign * compare(a, b, key) || a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
}
