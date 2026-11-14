import type { Config, Issue, Signal } from '@spm/shared';
import { computeCoverage } from './coverage.js';
import { computeCpm } from './cpm.js';
import { checkAcyclic, descendantCounts } from './graph.js';
import { packSprints } from './pack.js';
import { priorityOrder } from './priority.js';
import { computeSignals } from './signals.js';
import type { Thresholds } from './signals.js';
import type { Coverage, PlanCore, Schedule, TaskInput } from './types.js';
import { compareCodes } from './util.js';
import { validateEdges } from './validate.js';

export type SchedulePlanResult =
  | {
      ok: true;
      /** plan.json `schedule`. */
      schedule: Schedule;
      /** plan.json `signals`. */
      signals: Signal[];
      /** plan.json `coverage`. */
      coverage: Coverage;
      /** Edge validation issues (stage 5). The caller merges them into plan.json `issues`. */
      issues: Issue[];
      /** The validated edges that were actually scheduled. */
      dependencies: PlanCore['dependencies'];
    }
  | {
      ok: false;
      cycles: string[][];
      cyclePaths: string[][];
      blocked: string[];
      issues: Issue[];
      dependencies: PlanCore['dependencies'];
    };

/** Display days: hours / focus hours per day, rounded to the nearest half day. */
const toDays = (hours: number, focusHoursPerDay: number) =>
  Math.round((hours / focusHoursPerDay) * 2) / 2;

/**
 * The single entry point for the API and the browser (pure, synchronous, no I/O).
 * validateEdges -> checkAcyclic -> computeCpm -> priorityOrder -> packSprints -> computeSignals.
 *
 * Returns `{ ok: false, cycles, ... }` instead of a schedule when the graph has a cycle, so
 * the caller can run the repair policy (B1 Issue 3). Throws OversizedTaskError when a task
 * cannot fit an empty sprint (config validation normally prevents it).
 * Output does not depend on the order of `core.tasks` or `core.dependencies`.
 */
export function schedulePlan(
  core: PlanCore,
  config: Config,
  thresholds: Partial<Thresholds> = {},
): SchedulePlanResult {
  const sortedTasks = [...core.tasks].sort((a, b) => compareCodes(a.id, b.id));
  const taskIds = sortedTasks.map((t) => t.id);
  if (new Set(taskIds).size !== taskIds.length) {
    throw new Error('Task ids must be unique.');
  }

  const validated = validateEdges(taskIds, core.dependencies);
  // Sorted, so the output never depends on the order the caller listed the dependencies in.
  const edges = [...validated.edges].sort(
    (a, b) => compareCodes(a.from, b.from) || compareCodes(a.to, b.to),
  );

  const acyclic = checkAcyclic(taskIds, edges);
  if (!acyclic.ok) {
    return {
      ok: false,
      cycles: acyclic.cycles,
      cyclePaths: acyclic.cyclePaths,
      blocked: acyclic.blocked,
      issues: validated.issues,
      dependencies: edges,
    };
  }

  const inputs: TaskInput[] = sortedTasks.map((t) => ({
    id: t.id,
    points: t.points,
    hours: t.hours,
  }));
  const hours = Object.fromEntries(inputs.map((t) => [t.id, t.hours]));
  const cpm = computeCpm(acyclic.order, edges, hours);
  const descendants = descendantCounts(taskIds, edges);
  const order = priorityOrder(taskIds, edges, cpm);

  const capacityPoints = config.team_size * config.velocity_points_per_person;
  const sprintHours = config.sprint_length_days * config.focus_hours_per_day;
  const packed = packSprints(order, edges, inputs, {
    capacityPoints,
    sprintHours,
    mode: config.pack_mode,
  });

  const schedule: Schedule = {
    unit: 'hours',
    cpm: {
      duration_hours: cpm.durationHours,
      duration_days: toDays(cpm.durationHours, config.focus_hours_per_day),
      critical_path: cpm.criticalPath,
    },
    capacity_plan: {
      sprint_count: packed.sprintCount,
      duration_days: packed.sprintCount * config.sprint_length_days,
      capacity_points_per_sprint: capacityPoints,
      hours_per_sprint: sprintHours,
    },
    tasks: taskIds.map((id) => {
      const c = cpm.tasks[id];
      const p = packed.tasks[id];
      if (c === undefined || p === undefined) throw new Error(`Task ${id} was not scheduled.`);
      return {
        task_id: id,
        es: c.es,
        ef: c.ef,
        ls: c.ls,
        lf: c.lf,
        slack: c.slack,
        critical: c.critical,
        sprint: p.sprint,
        planned_start: p.plannedStart,
        planned_finish: p.plannedFinish,
        descendants: descendants[id] ?? 0,
      };
    }),
    sprints: packed.sprints.map((s) => ({
      number: s.number,
      load_points: s.loadPoints,
      capacity_points: capacityPoints,
      utilisation: s.loadPoints / capacityPoints,
      task_ids: s.taskIds,
    })),
  };

  const scheduledCore = { ...core, dependencies: edges, schedule };
  return {
    ok: true,
    schedule,
    signals: computeSignals(scheduledCore, thresholds),
    coverage: computeCoverage(core),
    issues: validated.issues,
    dependencies: edges,
  };
}
