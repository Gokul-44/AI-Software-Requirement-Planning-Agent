import type { CpmResult, CpmTask, Edge } from './types.js';
import { compareCodes } from './util.js';

/**
 * B4.3 critical path method in integer hours (one developer per task).
 * `order` must be a topological order of every task. LF of every sink is the project
 * duration D = max EF (N2 fix), so an isolated task has slack D - d.
 * Throws RangeError for hours that are not positive integers and Error for a bad order.
 */
export function computeCpm(
  order: readonly string[],
  edges: readonly Edge[],
  hours: Readonly<Record<string, number>>,
): CpmResult {
  const pos = new Map<string, number>();
  order.forEach((id, i) => {
    if (pos.has(id)) throw new Error(`Task ${id} appears twice in the topological order.`);
    pos.set(id, i);
    const h = hours[id];
    if (h === undefined || !Number.isInteger(h) || h <= 0) {
      throw new RangeError(
        `Task ${id} needs a positive integer duration in hours, got ${String(h)}.`,
      );
    }
  });

  const preds = new Map<string, string[]>(order.map((id) => [id, []]));
  const succs = new Map<string, string[]>(order.map((id) => [id, []]));
  for (const e of edges) {
    const pu = pos.get(e.from);
    const pv = pos.get(e.to);
    if (pu === undefined || pv === undefined) {
      throw new Error(`Edge ${e.from} -> ${e.to} refers to a task that is not in the order.`);
    }
    if (pu >= pv) throw new Error(`The order is not topological: ${e.from} must precede ${e.to}.`);
    (preds.get(e.to) as string[]).push(e.from);
    (succs.get(e.from) as string[]).push(e.to);
  }

  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  let duration = 0;
  for (const id of order) {
    let start = 0;
    for (const u of preds.get(id) as string[]) start = Math.max(start, ef.get(u) as number);
    es.set(id, start);
    const finish = start + (hours[id] as number);
    ef.set(id, finish);
    duration = Math.max(duration, finish);
  }

  const tasks: Record<string, CpmTask> = {};
  const ls = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i] as string;
    let lf = duration;
    for (const w of succs.get(id) as string[]) lf = Math.min(lf, ls.get(w) as number);
    const latestStart = lf - (hours[id] as number);
    ls.set(id, latestStart);
    const earliestStart = es.get(id) as number;
    const slack = latestStart - earliestStart;
    tasks[id] = {
      es: earliestStart,
      ef: ef.get(id) as number,
      ls: latestStart,
      lf,
      slack,
      critical: slack === 0,
    };
  }

  const result: CpmResult = { durationHours: duration, tasks, criticalPath: [] };
  result.criticalPath = criticalPath(order, edges, result);
  return result;
}

/**
 * One chain of critical tasks for display. A critical edge (u, v) has both ends critical and
 * EF(u) = ES(v). The chain starts at the smallest-code critical task with ES = 0 and follows
 * the smallest-code critical successor, so it runs from 0 to D and is reproducible. Several
 * critical paths may exist; every critical task is flagged in `cpm.tasks` regardless.
 */
export function criticalPath(
  order: readonly string[],
  edges: readonly Edge[],
  cpm: CpmResult,
): string[] {
  const next = new Map<string, string[]>();
  for (const e of edges) {
    const u = cpm.tasks[e.from];
    const v = cpm.tasks[e.to];
    if (u === undefined || v === undefined || !u.critical || !v.critical || u.ef !== v.es) continue;
    const list = next.get(e.from) ?? [];
    list.push(e.to);
    next.set(e.from, list);
  }

  const starts = order
    .filter((id) => cpm.tasks[id]?.critical === true && cpm.tasks[id]?.es === 0)
    .sort(compareCodes);
  const first = starts[0];
  if (first === undefined) return [];

  const path = [first];
  let current = first;
  for (;;) {
    const options = next.get(current);
    if (options === undefined || options.length === 0) break;
    current = [...options].sort(compareCodes)[0] as string;
    path.push(current);
  }
  return path;
}
