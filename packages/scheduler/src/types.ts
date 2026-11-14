import type { Config, Plan, PlanRequirement } from '@spm/shared';

/**
 * Finish-to-Start edge: `from` must finish before `to` can start (MASTER_PLAN B1, Issue 6).
 * Extra fields (type, source, reason) pass through the validators untouched.
 */
export interface Edge {
  from: string;
  to: string;
}

/** A task as the scheduler sees it: points for capacity, integer hours for time. */
export interface TaskInput {
  id: string;
  points: number;
  hours: number;
}

/** Per-task CPM result, in integer hours. `critical` is exactly `slack === 0`. */
export interface CpmTask {
  es: number;
  ef: number;
  ls: number;
  lf: number;
  slack: number;
  critical: boolean;
}

export interface CpmResult {
  /** Project duration D = max EF. 0 for an empty graph. */
  durationHours: number;
  tasks: Record<string, CpmTask>;
  /** One longest chain of critical tasks, for display. Every critical task also has its flag. */
  criticalPath: string[];
}

export type PackMode = Config['pack_mode'];

/** C = team_size * velocity (points per sprint); H = sprint_length_days * focus_hours_per_day. */
export interface PackConfig {
  capacityPoints: number;
  sprintHours: number;
  mode: PackMode;
}

export interface PackedTask {
  /** 1-based sprint number. */
  sprint: number;
  /** Offset inside the sprint, in hours (indicative: no individual developer is assigned). */
  start: number;
  finish: number;
  /** Gantt position: (sprint - 1) * H + start, and plannedStart + hours. */
  plannedStart: number;
  plannedFinish: number;
}

export interface PackedSprint {
  number: number;
  /** In packing (priority) order. */
  taskIds: string[];
  loadPoints: number;
}

export interface PackResult {
  sprintCount: number;
  sprints: PackedSprint[];
  tasks: Record<string, PackedTask>;
}

export type Schedule = Plan['schedule'];

/** What the scheduler needs from a plan before scheduling (a full Plan satisfies it). */
export interface PlanCore {
  requirements: Pick<PlanRequirement, 'id' | 'priority'>[];
  stories: { id: string; requirement_ids: string[] }[];
  tasks: {
    id: string;
    story_id: string;
    title: string;
    layer: Plan['tasks'][number]['layer'];
    points: Plan['tasks'][number]['points'];
    hours: number;
  }[];
  dependencies: Edge[];
  /** Edges that were removed during cycle repair (feeds the `cycle_repaired` signal). */
  repaired_edges?: Edge[];
}

/** A plan core plus its computed schedule: the input of computeSignals. */
export type ScheduledPlanCore = PlanCore & { schedule: Schedule };

export type Coverage = Plan['coverage'];
