import { OversizedTaskError } from './errors.js';
import type { Edge, PackConfig, PackResult, PackedSprint, PackedTask, TaskInput } from './types.js';

/**
 * B4.4 sprint packing over a topological `order` (normally priorityOrder).
 *
 * Guard first: any task with points > C or hours > H throws OversizedTaskError before anything
 * is placed. Under the guard an empty sprint always accepts a task, so the search ends at the
 * latest at (highest sprint used) + 1: no infinite loop (B1 Issue 2).
 *
 * relaxed: start at the latest predecessor sprint; a predecessor in the same sprint must
 * finish before the task starts, and start + d must fit in H.
 * strict (deck rule): start at 1 + the latest predecessor sprint, so every predecessor is in
 * an earlier sprint. Kept for comparison.
 */
export function packSprints(
  order: readonly string[],
  edges: readonly Edge[],
  tasks: readonly TaskInput[],
  cfg: PackConfig,
): PackResult {
  const { capacityPoints: C, sprintHours: H, mode } = cfg;
  if (!Number.isFinite(C) || C <= 0 || !Number.isFinite(H) || H <= 0) {
    throw new RangeError(
      `Sprint capacity C and sprint hours H must be positive, got C=${C}, H=${H}.`,
    );
  }

  const byId = new Map<string, TaskInput>();
  for (const t of tasks) {
    if (byId.has(t.id)) throw new Error(`Task ${t.id} is listed twice.`);
    byId.set(t.id, t);
  }
  const seenInOrder = new Set<string>();
  for (const id of order) {
    if (seenInOrder.has(id)) throw new Error(`Task ${id} appears twice in the order.`);
    seenInOrder.add(id);
    const t = byId.get(id);
    if (t === undefined) throw new RangeError(`Task ${id} has no points and hours.`);
    if (!Number.isFinite(t.points) || t.points < 0) {
      throw new RangeError(`Task ${id} has invalid points ${t.points}.`);
    }
    if (!Number.isInteger(t.hours) || t.hours <= 0) {
      throw new RangeError(
        `Task ${id} needs a positive integer duration in hours, got ${t.hours}.`,
      );
    }
  }

  // Guard first, for the whole order, before any placement.
  for (const id of order) {
    const t = byId.get(id) as TaskInput;
    if (t.points > C) throw new OversizedTaskError(id, 'points', t.points, C);
    if (t.hours > H) throw new OversizedTaskError(id, 'hours', t.hours, H);
  }

  const preds = new Map<string, string[]>(order.map((id) => [id, []]));
  for (const e of edges) {
    if (!seenInOrder.has(e.from) || !seenInOrder.has(e.to)) {
      throw new Error(`Edge ${e.from} -> ${e.to} refers to a task that is not in the order.`);
    }
    (preds.get(e.to) as string[]).push(e.from);
  }

  const placed: Record<string, PackedTask> = {};
  const loads: number[] = [];
  const members: string[][] = [];

  for (const id of order) {
    const t = byId.get(id) as TaskInput;
    const taskPreds = preds.get(id) as string[];
    let latestPredSprint = 0;
    for (const u of taskPreds) {
      const p = placed[u];
      if (p === undefined)
        throw new Error(`The order is not topological: ${u} must precede ${id}.`);
      latestPredSprint = Math.max(latestPredSprint, p.sprint);
    }

    let s = mode === 'strict' ? latestPredSprint + 1 : Math.max(1, latestPredSprint);
    const limit = order.length + latestPredSprint + 2; // defensive: never reached under the guard
    for (; ; s++) {
      if (s > limit) throw new Error(`Internal error: no sprint accepted task ${id}.`);
      let start = 0;
      for (const u of taskPreds) {
        const p = placed[u] as PackedTask;
        if (p.sprint === s) start = Math.max(start, p.finish);
      }
      const load = loads[s - 1] ?? 0;
      if (load + t.points <= C && start + t.hours <= H) {
        while (loads.length < s) {
          loads.push(0);
          members.push([]);
        }
        loads[s - 1] = load + t.points;
        (members[s - 1] as string[]).push(id);
        placed[id] = {
          sprint: s,
          start,
          finish: start + t.hours,
          plannedStart: (s - 1) * H + start,
          plannedFinish: (s - 1) * H + start + t.hours,
        };
        break;
      }
    }
  }

  const sprints: PackedSprint[] = loads.map((loadPoints, i) => ({
    number: i + 1,
    taskIds: members[i] as string[],
    loadPoints,
  }));
  return { sprintCount: sprints.length, sprints, tasks: placed };
}
