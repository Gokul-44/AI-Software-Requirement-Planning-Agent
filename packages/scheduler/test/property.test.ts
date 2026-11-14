import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  checkAcyclic,
  computeCpm,
  descendantCounts,
  packSprints,
  priorityOrder,
  schedulePlan,
} from '../src/index.js';
import type { Edge, PlanCore, TaskInput } from '../src/index.js';
import { shuffled } from './helpers.js';

const POINTS = [1, 2, 3, 5, 8, 13] as const;

interface RandomDag {
  ids: string[];
  edges: Edge[];
  tasks: (TaskInput & { points: (typeof POINTS)[number] })[];
  capacity: number;
  sprintHours: number;
}

/** Random DAG: nodes are numbered, edges only go from a lower to a higher number. */
const dagArb: fc.Arbitrary<RandomDag> = fc
  .integer({ min: 0, max: 150 })
  .chain((n) =>
    fc.record({
      n: fc.constant(n),
      perm: fc.shuffledSubarray(
        Array.from({ length: n }, (_, i) => i),
        { minLength: n, maxLength: n },
      ),
      pairs: fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 450 }),
      chain: fc.array(fc.boolean(), { minLength: n, maxLength: n }),
      chainMode: fc.boolean(),
      points: fc.array(fc.constantFrom(...POINTS), { minLength: n, maxLength: n }),
      hours: fc.array(fc.integer({ min: 1, max: 52 }), { minLength: n, maxLength: n }),
      capacity: fc.integer({ min: 13, max: 60 }),
      sprintHours: fc.integer({ min: 52, max: 120 }),
    }),
  )
  .map(({ n, perm, pairs, chain, chainMode, points, hours, capacity, sprintHours }) => {
    const code = (i: number) => `T-${String(perm[i] ?? i).padStart(3, '0')}`;
    const seen = new Set<string>();
    const edges: Edge[] = [];
    const add = (a: number, b: number) => {
      if (a === b || n === 0) return;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}>${hi}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ from: code(lo), to: code(hi) });
    };
    for (const [a, b] of pairs) if (n > 0) add(a % n, b % n);
    if (chainMode) for (let i = 0; i + 1 < n; i++) if (chain[i]) add(i, i + 1);
    const tasks: RandomDag['tasks'] = Array.from({ length: n }, (_, i) => ({
      id: code(i),
      points: points[i] ?? 1,
      hours: hours[i] ?? 1,
    }));
    return { ids: tasks.map((t) => t.id), edges, tasks, capacity, sprintHours };
  });

function expectOk<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  expect(r.ok).toBe(true);
}

function check(dag: RandomDag): { strict: number; relaxed: number } {
  const { ids, edges, tasks, capacity, sprintHours } = dag;
  const hours = Object.fromEntries(tasks.map((t) => [t.id, t.hours]));

  const acyclic = checkAcyclic(ids, edges);
  expectOk(acyclic);
  expect(acyclic.order).toHaveLength(ids.length);
  expect(new Set(acyclic.order)).toEqual(new Set(ids));

  const cpm = computeCpm(acyclic.order, edges, hours);
  let maxEf = 0;
  for (const id of ids) {
    const t = cpm.tasks[id];
    expect(t).toBeDefined();
    if (t === undefined) continue;
    // slack >= 0, integer arithmetic, critical <=> slack = 0
    expect(t.slack).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(t.es) && Number.isInteger(t.lf)).toBe(true);
    expect(t.ef - t.es).toBe(hours[id]);
    expect(t.lf - t.ls).toBe(hours[id]);
    expect(t.slack).toBe(t.ls - t.es);
    expect(t.critical).toBe(t.slack === 0);
    expect(t.lf).toBeLessThanOrEqual(cpm.durationHours);
    maxEf = Math.max(maxEf, t.ef);
  }
  // max EF = D
  expect(cpm.durationHours).toBe(maxEf);
  // every edge: EF(u) <= ES(v), and the backward pass is consistent
  for (const e of edges) {
    const u = cpm.tasks[e.from];
    const v = cpm.tasks[e.to];
    expect(u && v && u.ef <= v.es).toBe(true);
    expect(u && v && u.lf <= v.ls).toBe(true);
  }
  // critical path: a chain of critical tasks joined by edges, spanning 0..D
  if (ids.length > 0) {
    expect(ids.some((id) => cpm.tasks[id]?.critical)).toBe(true);
    const path = cpm.criticalPath;
    expect(path.length).toBeGreaterThan(0);
    expect(cpm.tasks[path[0] ?? '']?.es).toBe(0);
    expect(cpm.tasks[path[path.length - 1] ?? '']?.ef).toBe(cpm.durationHours);
    const edgeSet = new Set(edges.map((e) => `${e.from}>${e.to}`));
    let sum = 0;
    for (let i = 0; i < path.length; i++) {
      const id = path[i] as string;
      expect(cpm.tasks[id]?.critical).toBe(true);
      sum += hours[id] ?? 0;
      if (i + 1 < path.length) expect(edgeSet.has(`${id}>${path[i + 1]}`)).toBe(true);
    }
    expect(sum).toBe(cpm.durationHours);
  } else {
    expect(cpm.criticalPath).toEqual([]);
    expect(cpm.durationHours).toBe(0);
  }

  // priority order: a permutation and a valid topological order
  const order = priorityOrder(ids, edges, cpm);
  expect(order).toHaveLength(ids.length);
  expect(new Set(order)).toEqual(new Set(ids));
  const pos = new Map(order.map((id, i) => [id, i]));
  for (const e of edges) expect((pos.get(e.from) ?? 0) < (pos.get(e.to) ?? 0)).toBe(true);

  // descendants: matches brute-force reachability
  const desc = descendantCounts(ids, edges);
  const succ = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) succ.get(e.from)?.push(e.to);
  for (const id of ids.slice(0, 20)) {
    const seen = new Set<string>();
    const stack = [...(succ.get(id) ?? [])];
    while (stack.length > 0) {
      const x = stack.pop() as string;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...(succ.get(x) ?? []));
    }
    expect(desc[id]).toBe(seen.size);
  }

  // packing
  const relaxed = packSprints(order, edges, tasks, {
    capacityPoints: capacity,
    sprintHours,
    mode: 'relaxed',
  });
  const strict = packSprints(order, edges, tasks, {
    capacityPoints: capacity,
    sprintHours,
    mode: 'strict',
  });
  for (const packed of [relaxed, strict]) {
    // no sprint load exceeds C, every task placed exactly once
    const placed = packed.sprints.flatMap((s) => s.taskIds);
    expect(placed).toHaveLength(ids.length);
    expect(new Set(placed)).toEqual(new Set(ids));
    for (const s of packed.sprints) expect(s.loadPoints).toBeLessThanOrEqual(capacity);
    for (const t of tasks) {
      const p = packed.tasks[t.id];
      expect(p?.finish).toBe((p?.start ?? 0) + t.hours);
      expect(p?.plannedStart).toBe(((p?.sprint ?? 1) - 1) * sprintHours + (p?.start ?? 0));
      expect(p?.finish ?? Infinity).toBeLessThanOrEqual(sprintHours);
    }
    // every edge: sprint(u) < sprint(v), or the same sprint with fin(u) <= start(v)
    for (const e of edges) {
      const u = packed.tasks[e.from];
      const v = packed.tasks[e.to];
      if (u === undefined || v === undefined) throw new Error('unplaced task');
      expect(u.sprint < v.sprint || (u.sprint === v.sprint && u.finish <= v.start)).toBe(true);
    }
  }
  for (const e of edges) {
    expect((strict.tasks[e.from]?.sprint ?? 0) < (strict.tasks[e.to]?.sprint ?? 0)).toBe(true);
  }
  // Lower bound for any packing, and at most one sprint per task.
  const totalPoints = tasks.reduce((a, t) => a + t.points, 0);
  const lowerBound = Math.ceil(totalPoints / capacity);
  for (const packed of [relaxed, strict]) {
    expect(packed.sprintCount).toBeGreaterThanOrEqual(lowerBound);
    expect(packed.sprintCount).toBeLessThanOrEqual(ids.length);
  }
  // NOTE: "strict count >= relaxed count" is NOT asserted per DAG. Greedy first-fit in a fixed
  // order has bin-packing anomalies (see the pinned counterexample in e1-known-answer.test.ts),
  // so the property is checked statistically below instead.
  return { strict: strict.sprintCount, relaxed: relaxed.sprintCount };
}

describe('property tests: 1000 random DAGs of up to 150 nodes', () => {
  it('CPM, priority order and packing invariants hold', () => {
    let runs = 0;
    let relaxedWorse = 0;
    let relaxedBetter = 0;
    fc.assert(
      fc.property(dagArb, (dag) => {
        const { strict, relaxed } = check(dag);
        runs++;
        if (relaxed > strict) relaxedWorse++;
        if (relaxed < strict) relaxedBetter++;
      }),
      { numRuns: 1000 },
    );
    // Relaxed packing is no worse than strict on the overwhelming majority of DAGs, and
    // strictly better on many (the N1 over-serialisation fix).
    expect(runs).toBeGreaterThanOrEqual(1000);
    expect(relaxedWorse / runs).toBeLessThanOrEqual(0.05);
    expect(relaxedBetter).toBeGreaterThan(0);
  }, 120_000);

  it('schedulePlan is consistent with the building blocks and independent of input order', () => {
    fc.assert(
      fc.property(dagArb, fc.integer({ min: 1, max: 1_000_000 }), (dag, seed) => {
        const toCore = (d: RandomDag, perm: boolean): PlanCore => {
          const tasks = perm ? shuffled(d.tasks, seed) : d.tasks;
          const deps = perm ? shuffled(d.edges, seed + 1) : d.edges;
          return {
            requirements: [{ id: 'R-001', priority: 'must' }],
            stories: [{ id: 'S-001', requirement_ids: ['R-001'] }],
            tasks: tasks.map((t) => ({
              id: t.id,
              story_id: 'S-001',
              title: `Task ${t.id}`,
              layer: 'backend' as const,
              points: t.points,
              hours: t.hours,
            })),
            dependencies: deps.map((e) => ({ ...e })),
          };
        };
        const config = {
          team_size: 1,
          velocity_points_per_person: dag.capacity,
          sprint_length_days: 1,
          focus_hours_per_day: dag.sprintHours,
          points_to_hours: { '1': 4, '2': 8, '3': 12, '5': 20, '8': 32, '13': 52 },
          pack_mode: 'relaxed' as const,
        };
        const a = schedulePlan(toCore(dag, false), config);
        const b = schedulePlan(toCore(dag, true), config);
        expect(b).toEqual(a);
        expectOk(a);
        expect(a.schedule.tasks).toHaveLength(dag.ids.length);
        for (const t of a.schedule.tasks) {
          expect(t.slack).toBeGreaterThanOrEqual(0);
          expect(t.critical).toBe(t.slack === 0);
        }
        for (const s of a.schedule.sprints) expect(s.load_points).toBeLessThanOrEqual(dag.capacity);
        const ids = a.signals.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
      }),
      { numRuns: 1000 },
    );
  }, 120_000);
});
