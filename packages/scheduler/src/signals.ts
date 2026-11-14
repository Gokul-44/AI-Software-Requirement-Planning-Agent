import type { Signal } from '@spm/shared';
import { requirementsWithoutStory, requirementsWithoutTask } from './coverage.js';
import { findDuplicateTitles } from './similarity.js';
import type { ScheduledPlanCore } from './types.js';
import { compareCodes } from './util.js';

/** Default thresholds (B5). They are assumptions and can be overridden per call. */
export interface Thresholds {
  /** critical_path_length: share of critical tasks for high / medium severity. */
  criticalShareHigh: number;
  criticalShareMedium: number;
  /** critical_high_fanout: critical task with at least this many transitive descendants. */
  criticalFanoutHigh: number;
  /** high_fan_in: at least this many direct predecessors. */
  fanInMin: number;
  /** sprint_overload: utilisation (load / C) for medium / high severity. */
  overloadMedium: number;
  overloadHigh: number;
  /** sprint_imbalance: coefficient of variation of utilisation (last sprint excluded). */
  imbalanceCv: number;
  /** capacity_bound: capacity-feasible duration / CPM duration. */
  capacityBoundRatio: number;
  /** isolated_task: this many isolated tasks raise severity from low to medium. */
  isolatedMediumCount: number;
  /** layer_imbalance: minimum testing share of points. */
  testingShareMin: number;
  /** critical_layer_concentration: share of critical-path hours held by one layer. */
  layerConcentration: number;
  /** oversized_task: tasks at or above this many points. */
  oversizedPoints: number;
  /** duplicate_task_suspect: title Jaccard similarity. */
  duplicateSimilarity: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  criticalShareHigh: 0.4,
  criticalShareMedium: 0.25,
  criticalFanoutHigh: 5,
  fanInMin: 4,
  overloadMedium: 0.9,
  overloadHigh: 0.98,
  imbalanceCv: 0.35,
  capacityBoundRatio: 1.5,
  isolatedMediumCount: 3,
  testingShareMin: 0.1,
  layerConcentration: 0.6,
  oversizedPoints: 13,
  duplicateSimilarity: 0.8,
};

/** SignalId allows SG-01 to SG-999. */
export const MAX_SIGNALS = 999;
/** A plan with many near-identical titles would otherwise flood the register. */
export const MAX_DUPLICATE_SIGNALS = 25;

/** A devops task whose title says it ships something (rule for `layer_anomaly`). */
export const DEPLOY_TITLE = /\b(deploy\w*|release\w*|rollout|go[ -]?live|launch\w*|publish\w*)\b/i;

type Severity = Signal['severity'];

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const label = (id: string, title: string) => `${id} "${title}"`;

/**
 * Computes every B5 signal from a scheduled plan. Severity and numbers come from code only.
 * Output order is fixed (kinds in table order, then ids), so SG ids are reproducible.
 * `plan.schedule` must come from schedulePlan (or be shaped like it).
 */
export function computeSignals(
  plan: ScheduledPlanCore,
  thresholds: Partial<Thresholds> = {},
): Signal[] {
  const th: Thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const { schedule } = plan;
  const tasks = [...plan.tasks].sort((a, b) => compareCodes(a.id, b.id));
  const taskIds = new Set(tasks.map((t) => t.id));
  const scheduled = new Map(schedule.tasks.map((t) => [t.task_id, t]));

  const predCount = new Map<string, number>(tasks.map((t) => [t.id, 0]));
  const succCount = new Map<string, number>(tasks.map((t) => [t.id, 0]));
  const seenEdges = new Set<string>();
  for (const e of plan.dependencies) {
    const key = `${e.from}\u0000${e.to}`;
    if (seenEdges.has(key) || !taskIds.has(e.from) || !taskIds.has(e.to) || e.from === e.to) {
      continue;
    }
    seenEdges.add(key);
    predCount.set(e.to, (predCount.get(e.to) as number) + 1);
    succCount.set(e.from, (succCount.get(e.from) as number) + 1);
  }

  const out: Omit<Signal, 'id'>[] = [];
  const emit = (
    kind: Signal['kind'],
    severity: Severity,
    value: number,
    threshold: number | null,
    task_ids: string[],
    message: string,
  ) => out.push({ kind, severity, value, threshold, task_ids, message });

  const critical = tasks.filter((t) => scheduled.get(t.id)?.critical === true);
  const D = schedule.cpm.duration_hours;

  // critical_path_length
  if (tasks.length > 0) {
    const share = critical.length / tasks.length;
    let severity: Severity = 'low';
    let threshold: number | null = null;
    if (share >= th.criticalShareHigh) {
      severity = 'high';
      threshold = th.criticalShareHigh;
    } else if (share >= th.criticalShareMedium) {
      severity = 'medium';
      threshold = th.criticalShareMedium;
    }
    emit(
      'critical_path_length',
      severity,
      round4(share),
      threshold,
      critical.map((t) => t.id),
      `CPM duration is ${D} h (${schedule.cpm.duration_days} working days); ` +
        `${critical.length} of ${tasks.length} tasks (${Math.round(share * 100)}%) are critical.`,
    );
  }

  // critical_high_fanout
  for (const t of critical) {
    const s = scheduled.get(t.id);
    const descendants = s?.descendants ?? 0;
    if (descendants >= th.criticalFanoutHigh) {
      emit(
        'critical_high_fanout',
        'high',
        descendants,
        th.criticalFanoutHigh,
        [t.id],
        `${label(t.id, t.title)} has ${plural(descendants, 'downstream task', 'downstream tasks')} ` +
          `and ${s?.slack ?? 0} h slack (CPM).`,
      );
    }
  }

  // high_fan_in
  for (const t of tasks) {
    const n = predCount.get(t.id) as number;
    if (n >= th.fanInMin) {
      emit(
        'high_fan_in',
        'medium',
        n,
        th.fanInMin,
        [t.id],
        `${label(t.id, t.title)} has ${n} direct predecessors (integration bottleneck).`,
      );
    }
  }

  // sprint_overload
  const sprints = [...schedule.sprints].sort((a, b) => a.number - b.number);
  for (const sp of sprints) {
    const util = sp.capacity_points > 0 ? sp.load_points / sp.capacity_points : 0;
    let severity: Severity | null = null;
    let threshold = 0;
    if (util >= th.overloadHigh) {
      severity = 'high';
      threshold = th.overloadHigh;
    } else if (util >= th.overloadMedium) {
      severity = 'medium';
      threshold = th.overloadMedium;
    }
    if (severity !== null) {
      emit(
        'sprint_overload',
        severity,
        round4(util),
        threshold,
        [...sp.task_ids].sort(compareCodes),
        `Sprint ${sp.number} is loaded to ${Math.round(util * 100)}% ` +
          `(${sp.load_points} of ${sp.capacity_points} points).`,
      );
    }
  }

  // sprint_imbalance: coefficient of variation (population) of utilisation, last sprint excluded
  if (sprints.length >= 3) {
    const considered = sprints.slice(0, -1);
    const utils = considered.map((sp) =>
      sp.capacity_points > 0 ? sp.load_points / sp.capacity_points : 0,
    );
    const mean = utils.reduce((a, b) => a + b, 0) / utils.length;
    if (mean > 0) {
      const variance = utils.reduce((a, u) => a + (u - mean) ** 2, 0) / utils.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv >= th.imbalanceCv) {
        const first = considered[0]?.number ?? 1;
        const last = considered[considered.length - 1]?.number ?? first;
        emit(
          'sprint_imbalance',
          'low',
          round4(cv),
          th.imbalanceCv,
          [],
          `Utilisation varies across sprints ${first}-${last} ` +
            `(coefficient of variation ${cv.toFixed(2)}, last sprint excluded).`,
        );
      }
    }
  }

  // capacity_bound
  const sprintCount = schedule.capacity_plan.sprint_count;
  if (D > 0 && sprintCount > 0) {
    const capacityHours = sprintCount * schedule.capacity_plan.hours_per_sprint;
    const ratio = capacityHours / D;
    if (ratio >= th.capacityBoundRatio) {
      emit(
        'capacity_bound',
        'medium',
        round4(ratio),
        th.capacityBoundRatio,
        [],
        `Capacity-feasible plan is ${Number(capacityHours.toFixed(1))} h ` +
          `(${plural(sprintCount, 'sprint', 'sprints')}) against a CPM minimum of ${D} h: ` +
          `ratio ${ratio.toFixed(2)}x.`,
      );
    }
  }

  // isolated_task (a one-task plan is trivially isolated, so it is not reported)
  if (tasks.length >= 2) {
    const isolated = tasks.filter((t) => predCount.get(t.id) === 0 && succCount.get(t.id) === 0);
    if (isolated.length > 0) {
      const medium = isolated.length >= th.isolatedMediumCount;
      const shown = isolated.slice(0, 10).map((t) => t.id);
      const more =
        isolated.length > shown.length ? `, and ${isolated.length - shown.length} more` : '';
      emit(
        'isolated_task',
        medium ? 'medium' : 'low',
        isolated.length,
        medium ? th.isolatedMediumCount : 1,
        isolated.map((t) => t.id),
        `${plural(isolated.length, 'task has', 'tasks have')} no predecessors and no successors: ` +
          `${shown.join(', ')}${more}.`,
      );
    }
  }

  // layer_anomaly
  for (const t of tasks) {
    if (predCount.get(t.id) !== 0) continue;
    if (t.layer === 'testing') {
      emit(
        'layer_anomaly',
        'low',
        0,
        null,
        [t.id],
        `${label(t.id, t.title)} is a testing task with no predecessor.`,
      );
    } else if (t.layer === 'devops' && DEPLOY_TITLE.test(t.title)) {
      emit(
        'layer_anomaly',
        'low',
        0,
        null,
        [t.id],
        `${label(t.id, t.title)} is a deploy-type devops task with no predecessor.`,
      );
    }
  }

  // layer_imbalance
  if (tasks.length > 0) {
    const totalPoints = tasks.reduce((a, t) => a + t.points, 0);
    const testing = tasks.filter((t) => t.layer === 'testing');
    const testingPoints = testing.reduce((a, t) => a + t.points, 0);
    if (totalPoints > 0 && testingPoints / totalPoints < th.testingShareMin) {
      const share = testingPoints / totalPoints;
      emit(
        'layer_imbalance',
        'medium',
        round4(share),
        th.testingShareMin,
        testing.map((t) => t.id),
        `Testing is ${testingPoints} of ${totalPoints} points (${(share * 100).toFixed(1)}%), ` +
          `below the ${Math.round(th.testingShareMin * 100)}% minimum.`,
      );
    }
    if (!tasks.some((t) => t.layer === 'devops')) {
      emit(
        'layer_imbalance',
        'medium',
        0,
        1,
        [],
        `The plan has no devops tasks (0 of ${tasks.length} tasks).`,
      );
    }
  }

  // uncovered_requirement (C1 and C3)
  const noStory = new Set(requirementsWithoutStory(plan));
  const noTask = new Set(requirementsWithoutTask(plan));
  for (const r of plan.requirements) {
    if (!noStory.has(r.id) && !noTask.has(r.id)) continue;
    emit(
      'uncovered_requirement',
      r.priority === 'must' ? 'high' : 'medium',
      0,
      null,
      [],
      noStory.has(r.id)
        ? `${r.id} (${r.priority}) has no story, so no task can trace to it.`
        : `${r.id} (${r.priority}) has stories but no tasks.`,
    );
  }

  // oversized_task
  for (const t of tasks) {
    if (t.points >= th.oversizedPoints) {
      emit(
        'oversized_task',
        'medium',
        t.points,
        th.oversizedPoints,
        [t.id],
        `${label(t.id, t.title)} is estimated at ${t.points} points and should be split.`,
      );
    }
  }

  // cycle_repaired
  const repaired = [
    ...new Map(
      (plan.repaired_edges ?? []).map((e) => [`${e.from}\u0000${e.to}`, e] as const),
    ).values(),
  ].sort((a, b) => compareCodes(a.from, b.from) || compareCodes(a.to, b.to));
  if (repaired.length > 0) {
    const involved = [...new Set(repaired.flatMap((e) => [e.from, e.to]))]
      .filter((id) => taskIds.has(id))
      .sort(compareCodes);
    emit(
      'cycle_repaired',
      'medium',
      repaired.length,
      null,
      involved,
      `${plural(repaired.length, 'edge was', 'edges were')} removed to break cycles: ` +
        `${repaired.map((e) => `${e.from}->${e.to}`).join(', ')}.`,
    );
  }

  // duplicate_task_suspect
  const titleOf = new Map(tasks.map((t) => [t.id, t.title]));
  for (const pair of findDuplicateTitles(tasks, th.duplicateSimilarity).slice(
    0,
    MAX_DUPLICATE_SIGNALS,
  )) {
    emit(
      'duplicate_task_suspect',
      'low',
      pair.similarity,
      th.duplicateSimilarity,
      [pair.a, pair.b],
      `${label(pair.a, titleOf.get(pair.a) ?? '')} and ${label(pair.b, titleOf.get(pair.b) ?? '')} ` +
        `have title similarity ${pair.similarity.toFixed(2)}.`,
    );
  }

  // critical_layer_concentration
  const criticalHours = critical.reduce((a, t) => a + t.hours, 0);
  if (criticalHours > 0) {
    const byLayer = new Map<string, { hours: number; ids: string[] }>();
    for (const t of critical) {
      const entry = byLayer.get(t.layer) ?? { hours: 0, ids: [] };
      entry.hours += t.hours;
      entry.ids.push(t.id);
      byLayer.set(t.layer, entry);
    }
    for (const [layer, { hours, ids }] of [...byLayer].sort(([a], [b]) => compareCodes(a, b))) {
      const share = hours / criticalHours;
      if (share >= th.layerConcentration) {
        emit(
          'critical_layer_concentration',
          'medium',
          round4(share),
          th.layerConcentration,
          ids,
          `Layer ${layer} holds ${hours} of ${criticalHours} critical-path hours ` +
            `(${Math.round(share * 100)}%).`,
        );
      }
    }
  }

  return out.slice(0, MAX_SIGNALS).map((s, i) => ({
    id: `SG-${String(i + 1).padStart(2, '0')}`,
    ...s,
  }));
}
