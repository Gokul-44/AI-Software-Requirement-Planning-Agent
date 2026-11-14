import type { Plan } from '../api/types';

type Schedule = Plan['schedule'];

export type GanttMode = 'sprint' | 'cpm';

export interface GanttBar {
  taskId: string;
  row: number;
  /** Bar start and end, in working hours from the project start. */
  start: number;
  end: number;
  /** CPM view only: latest finish, so the free float can be drawn after the bar. */
  floatEnd: number | null;
  critical: boolean;
  sprint: number;
}

export interface SprintBand {
  number: number;
  start: number;
  end: number;
}

export interface GanttLayout {
  mode: GanttMode;
  bars: GanttBar[];
  bands: SprintBand[];
  /** Common x extent in hours for both modes, so toggling shows the real difference. */
  totalHours: number;
  /** Where the schedule drawn here ends, and where the other one ends. */
  ownEndHours: number;
  otherEndHours: number;
  hoursPerSprint: number;
}

/**
 * Lays out the Gantt rows for one of the two timelines (design document B1 Issue 4):
 *  - "sprint": the capacity-feasible plan, bars at planned_start..planned_finish;
 *  - "cpm": the dependency-limited minimum with unlimited people, bars at es..ef.
 * Both use the same x scale and the same sprint bands; rows are sorted by start, then id.
 */
export function buildGantt(schedule: Schedule, mode: GanttMode): GanttLayout {
  const hoursPerSprint = schedule.capacity_plan.hours_per_sprint;
  const sprintEnd = Math.max(
    schedule.capacity_plan.sprint_count * hoursPerSprint,
    ...schedule.tasks.map((t) => t.planned_finish),
    0,
  );
  const cpmEnd = Math.max(schedule.cpm.duration_hours, ...schedule.tasks.map((t) => t.ef), 0);
  const totalHours = Math.max(sprintEnd, cpmEnd, 1);

  const raw = schedule.tasks.map((t) =>
    mode === 'sprint'
      ? { t, start: t.planned_start, end: t.planned_finish, floatEnd: null }
      : { t, start: t.es, end: t.ef, floatEnd: t.slack > 0 ? t.lf : null },
  );
  raw.sort(
    (a, b) =>
      a.start - b.start ||
      a.end - b.end ||
      a.t.task_id.localeCompare(b.t.task_id, undefined, { numeric: true }),
  );

  const bandCount = Math.max(1, Math.ceil(totalHours / hoursPerSprint));
  return {
    mode,
    bars: raw.map((r, row) => ({
      taskId: r.t.task_id,
      row,
      start: r.start,
      end: r.end,
      floatEnd: r.floatEnd,
      critical: r.t.critical,
      sprint: r.t.sprint,
    })),
    bands: Array.from({ length: bandCount }, (_, i) => ({
      number: i + 1,
      start: i * hoursPerSprint,
      end: Math.min((i + 1) * hoursPerSprint, totalHours),
    })),
    totalHours,
    ownEndHours: mode === 'sprint' ? sprintEnd : cpmEnd,
    otherEndHours: mode === 'sprint' ? cpmEnd : sprintEnd,
    hoursPerSprint,
  };
}
