import { describe, expect, it } from 'vitest';
import {
  OversizedTaskError,
  checkAcyclic,
  computeCpm,
  criticalPath,
  descendantCounts,
  packSprints,
  priorityOrder,
  schedulePlan,
  validateEdges,
} from '../src/index.js';
import type { CpmResult, Edge, PackConfig, TaskInput } from '../src/index.js';
import {
  E1_CONFIG,
  E1_EDGES,
  E1_HOURS,
  E1_IDS,
  E1_TASKS,
  e1Core,
  hoursOf,
  shuffled,
} from './helpers.js';

function acyclicOrder(ids: string[], edges: Edge[]): string[] {
  const r = checkAcyclic(ids, edges);
  if (!r.ok) throw new Error('expected a DAG');
  return r.order;
}

function e1Cpm(): CpmResult {
  return computeCpm(acyclicOrder(E1_IDS, E1_EDGES), E1_EDGES, E1_HOURS);
}

const RELAXED: PackConfig = { capacityPoints: 10, sprintHours: 40, mode: 'relaxed' };
const STRICT: PackConfig = { capacityPoints: 10, sprintHours: 40, mode: 'strict' };

describe('E1: CPM on the 6-task graph', () => {
  it('matches the known-answer table exactly (integer hours)', () => {
    const cpm = e1Cpm();
    expect(cpm.durationHours).toBe(52);
    expect(cpm.tasks).toEqual({
      A: { es: 0, ef: 8, ls: 0, lf: 8, slack: 0, critical: true },
      B: { es: 8, ef: 20, ls: 8, lf: 20, slack: 0, critical: true },
      C: { es: 8, ef: 16, ls: 12, lf: 20, slack: 4, critical: false },
      D: { es: 20, ef: 40, ls: 20, lf: 40, slack: 0, critical: true },
      E: { es: 16, ef: 20, ls: 36, lf: 40, slack: 20, critical: false },
      F: { es: 40, ef: 52, ls: 40, lf: 52, slack: 0, critical: true },
    });
  });

  it('extracts the critical path A-B-D-F', () => {
    expect(e1Cpm().criticalPath).toEqual(['A', 'B', 'D', 'F']);
    expect(criticalPath(acyclicOrder(E1_IDS, E1_EDGES), E1_EDGES, e1Cpm())).toEqual([
      'A',
      'B',
      'D',
      'F',
    ]);
  });

  it('counts transitive descendants', () => {
    expect(descendantCounts(E1_IDS, E1_EDGES)).toEqual({ A: 5, B: 2, C: 3, D: 1, E: 1, F: 0 });
  });

  it('orders by slack, then descendants, then code: A,B,C,D,E,F', () => {
    expect(priorityOrder(E1_IDS, E1_EDGES, e1Cpm())).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('flags every critical task even when several critical paths exist', () => {
    // Diamond with two equally long branches: both are critical, one chain is displayed.
    const ids = ['S', 'L', 'R', 'T'];
    const edges: Edge[] = [
      { from: 'S', to: 'L' },
      { from: 'S', to: 'R' },
      { from: 'L', to: 'T' },
      { from: 'R', to: 'T' },
    ];
    const cpm = computeCpm(acyclicOrder(ids, edges), edges, { S: 4, L: 8, R: 8, T: 4 });
    expect(cpm.durationHours).toBe(16);
    expect(ids.filter((id) => cpm.tasks[id]?.critical)).toEqual(['S', 'L', 'R', 'T']);
    expect(cpm.criticalPath).toEqual(['S', 'L', 'T']);
  });
});

describe('E1: sprint packing with C = 10 points', () => {
  const order = priorityOrder(E1_IDS, E1_EDGES, e1Cpm());

  it('strict mode (deck rule) needs 4 sprints: {A} {B,C} {D,E} {F}', () => {
    const r = packSprints(order, E1_EDGES, E1_TASKS, STRICT);
    expect(r.sprintCount).toBe(4);
    expect(r.sprints.map((s) => s.taskIds)).toEqual([['A'], ['B', 'C'], ['D', 'E'], ['F']]);
    expect(r.sprints.map((s) => s.loadPoints)).toEqual([2, 5, 6, 3]);
  });

  it('relaxed mode needs 2 sprints: S1 {A,B,C,E}=8, S2 {D,F}=8, with the exact offsets', () => {
    const r = packSprints(order, E1_EDGES, E1_TASKS, RELAXED);
    expect(r.sprintCount).toBe(2);
    expect(r.sprints.map((s) => [...s.taskIds].sort())).toEqual([
      ['A', 'B', 'C', 'E'],
      ['D', 'F'],
    ]);
    expect(r.sprints.map((s) => s.loadPoints)).toEqual([8, 8]);
    const slot = (id: string) => {
      const t = r.tasks[id];
      return t === undefined ? null : [t.sprint, t.start, t.finish];
    };
    expect(slot('A')).toEqual([1, 0, 8]);
    expect(slot('B')).toEqual([1, 8, 20]);
    expect(slot('C')).toEqual([1, 8, 16]);
    expect(slot('D')).toEqual([2, 0, 20]);
    expect(slot('E')).toEqual([1, 16, 20]);
    expect(slot('F')).toEqual([2, 20, 32]);
  });

  it('derives planned_start and planned_finish from the sprint offset', () => {
    const r = packSprints(order, E1_EDGES, E1_TASKS, RELAXED);
    // Sprint 2 begins at (2 - 1) * H = 40 h.
    expect(r.tasks['D']).toMatchObject({ plannedStart: 40, plannedFinish: 60 });
    expect(r.tasks['F']).toMatchObject({ plannedStart: 60, plannedFinish: 72 });
    expect(r.tasks['A']).toMatchObject({ plannedStart: 0, plannedFinish: 8 });
  });
});

describe('E1: capacity guard', () => {
  const order = ['A', 'B', 'C', 'D', 'E', 'F'];

  it('C = 4 throws OversizedTaskError(D, points 5 > 4) immediately', () => {
    const cfg: PackConfig = { capacityPoints: 4, sprintHours: 40, mode: 'relaxed' };
    let caught: unknown;
    try {
      packSprints(order, E1_EDGES, E1_TASKS, cfg);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OversizedTaskError);
    expect(caught).toMatchObject({ taskId: 'D', kind: 'points', value: 5, limit: 4 });
  }, 100);

  it('H = 16 throws OversizedTaskError(D, hours 20 > 16) immediately', () => {
    const cfg: PackConfig = { capacityPoints: 10, sprintHours: 16, mode: 'relaxed' };
    let caught: unknown;
    try {
      packSprints(order, E1_EDGES, E1_TASKS, cfg);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OversizedTaskError);
    expect(caught).toMatchObject({ taskId: 'D', kind: 'hours', value: 20, limit: 16 });
  }, 100);

  it('also guards strict mode', () => {
    const cfg: PackConfig = { capacityPoints: 4, sprintHours: 40, mode: 'strict' };
    expect(() => packSprints(order, E1_EDGES, E1_TASKS, cfg)).toThrow(OversizedTaskError);
  }, 100);

  it('checks the guard before placing anything, so no partial result leaks', () => {
    const tasks: TaskInput[] = [
      { id: 'X', points: 1, hours: 4 },
      { id: 'Y', points: 99, hours: 4 },
    ];
    expect(() =>
      packSprints(['X', 'Y'], [], tasks, { capacityPoints: 10, sprintHours: 40, mode: 'relaxed' }),
    ).toThrow(/Y/);
  }, 100);

  it('schedulePlan surfaces the same typed error', () => {
    const cfg = { ...E1_CONFIG, velocity_points_per_person: 4 };
    expect(() => schedulePlan(e1Core(), cfg)).toThrow(OversizedTaskError);
  }, 100);
});

describe('E1: cycle cases', () => {
  const ids = ['A', 'B', 'C', 'D'];

  it('A->B, B->C, C->A, C->D: exact SCC [[A,B,C]], blocked [D]', () => {
    const edges: Edge[] = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'A' },
      { from: 'C', to: 'D' },
    ];
    const r = checkAcyclic(ids, edges);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cycles).toEqual([['A', 'B', 'C']]);
    expect(r.blocked).toEqual(['D']);
    expect(r.cyclePaths).toEqual([['A', 'B', 'C', 'A']]);
  });

  it('does not report acyclic upstream nodes as cycle members', () => {
    const edges: Edge[] = [
      { from: 'X', to: 'A' },
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'A' },
      { from: 'C', to: 'D' },
    ];
    const r = checkAcyclic(['X', ...ids], edges);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cycles).toEqual([['A', 'B', 'C']]);
    expect(r.blocked).toEqual(['D']);
  });

  it('reports two disjoint cycles {A,B} and {D,E}', () => {
    const edges: Edge[] = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
      { from: 'D', to: 'E' },
      { from: 'E', to: 'D' },
    ];
    const r = checkAcyclic(['A', 'B', 'C', 'D', 'E'], edges);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cycles).toEqual([
      ['A', 'B'],
      ['D', 'E'],
    ]);
    expect(r.cyclePaths).toEqual([
      ['A', 'B', 'A'],
      ['D', 'E', 'D'],
    ]);
    expect(r.blocked).toEqual([]);
  });

  it('keeps two chained cycles separate (A<->B then C<->D)', () => {
    const edges: Edge[] = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'D' },
      { from: 'D', to: 'C' },
    ];
    const r = checkAcyclic(ids, edges);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cycles).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
    expect(r.blocked).toEqual([]);
  });

  it('finds a simple cycle path inside a larger SCC', () => {
    // A->B->C->D->A plus the chord B->D.
    const edges: Edge[] = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'D' },
      { from: 'D', to: 'A' },
      { from: 'B', to: 'D' },
    ];
    const r = checkAcyclic(ids, edges);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cycles).toEqual([['A', 'B', 'C', 'D']]);
    const path = r.cyclePaths[0] ?? [];
    expect(path[0]).toBe(path[path.length - 1]);
    for (let i = 0; i + 1 < path.length; i++) {
      expect(edges).toContainEqual({ from: path[i], to: path[i + 1] });
    }
    expect(new Set(path.slice(0, -1)).size).toBe(path.length - 1);
  });

  it('self-loop A->A is removed by validateEdges with a self_loop issue', () => {
    const edges: Edge[] = [
      { from: 'A', to: 'A' },
      { from: 'A', to: 'B' },
    ];
    const v = validateEdges(['A', 'B'], edges);
    expect(v.edges).toEqual([{ from: 'A', to: 'B' }]);
    expect(v.issues).toHaveLength(1);
    expect(v.issues[0]).toMatchObject({ kind: 'self_loop', refs: ['A', 'A'] });
    expect(checkAcyclic(['A', 'B'], v.edges).ok).toBe(true);
  });

  it('a self-loop passed straight to checkAcyclic is still a cycle, never a hang', () => {
    const r = checkAcyclic(['A', 'B'], [{ from: 'A', to: 'A' }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cycles).toEqual([['A']]);
    expect(r.cyclePaths).toEqual([['A', 'A']]);
    expect(r.blocked).toEqual([]);
  });

  it('schedulePlan reports cycles instead of scheduling', () => {
    const core = e1Core();
    core.dependencies.push({ from: 'F', to: 'A' });
    const r = schedulePlan(core, E1_CONFIG);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.cycles).toEqual([['A', 'B', 'C', 'D', 'E', 'F']]);
    expect(r.blocked).toEqual([]);
  });
});

describe('validateEdges', () => {
  it('drops unknown references, self-loops and duplicates, in that order of precedence', () => {
    const edges = [
      { from: 'A', to: 'B', reason: 'keep me' },
      { from: 'A', to: 'Z' },
      { from: 'Q', to: 'B' },
      { from: 'B', to: 'B' },
      { from: 'A', to: 'B', reason: 'dup' },
      { from: 'B', to: 'C' },
    ];
    const v = validateEdges(['A', 'B', 'C'], edges);
    expect(v.edges).toEqual([
      { from: 'A', to: 'B', reason: 'keep me' },
      { from: 'B', to: 'C' },
    ]);
    expect(v.issues.map((i) => i.kind)).toEqual([
      'unknown_reference',
      'unknown_reference',
      'self_loop',
      'duplicate_edge',
    ]);
    expect(v.issues.map((i) => i.id)).toEqual(['I-001', 'I-002', 'I-003', 'I-004']);
    expect(v.issues[0]).toMatchObject({ refs: ['A', 'Z'], severity: 'warning' });
  });

  it('returns no issues for a clean edge list', () => {
    const v = validateEdges(E1_IDS, E1_EDGES);
    expect(v.edges).toEqual(E1_EDGES);
    expect(v.issues).toEqual([]);
  });
});

describe('E1: other edge cases', () => {
  it('empty graph: D = 0, no sprints, no error', () => {
    const order = acyclicOrder([], []);
    expect(order).toEqual([]);
    const cpm = computeCpm(order, [], {});
    expect(cpm).toEqual({ durationHours: 0, tasks: {}, criticalPath: [] });
    expect(priorityOrder([], [], cpm)).toEqual([]);
    const packed = packSprints([], [], [], RELAXED);
    expect(packed.sprintCount).toBe(0);
    expect(packed.sprints).toEqual([]);
    const plan = schedulePlan(
      { requirements: [], stories: [], tasks: [], dependencies: [] },
      E1_CONFIG,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.schedule.cpm.duration_hours).toBe(0);
    expect(plan.schedule.capacity_plan.sprint_count).toBe(0);
    expect(plan.schedule.tasks).toEqual([]);
    expect(plan.schedule.sprints).toEqual([]);
    expect(plan.signals).toEqual([]);
  });

  it('single task: ES 0, EF = d, slack 0, critical, sprint 1', () => {
    const tasks: TaskInput[] = [{ id: 'A', points: 3, hours: 12 }];
    const cpm = computeCpm(['A'], [], { A: 12 });
    expect(cpm.durationHours).toBe(12);
    expect(cpm.tasks['A']).toEqual({ es: 0, ef: 12, ls: 0, lf: 12, slack: 0, critical: true });
    expect(cpm.criticalPath).toEqual(['A']);
    const r = packSprints(['A'], [], tasks, RELAXED);
    expect(r.sprintCount).toBe(1);
    expect(r.tasks['A']).toMatchObject({ sprint: 1, start: 0, finish: 12 });
  });

  it('isolated task among others: ES 0, LF = D, slack = D - d', () => {
    const ids = [...E1_IDS, 'Z'];
    const hours = { ...E1_HOURS, Z: 6 };
    const cpm = computeCpm(acyclicOrder(ids, E1_EDGES), E1_EDGES, hours);
    expect(cpm.durationHours).toBe(52);
    expect(cpm.tasks['Z']).toEqual({ es: 0, ef: 6, ls: 46, lf: 52, slack: 46, critical: false });
  });

  it('disconnected components: every sink gets LF = D', () => {
    // Component 1: P(10) -> Q(30), component 2: R(5) -> S(5).
    const ids = ['P', 'Q', 'R', 'S'];
    const edges: Edge[] = [
      { from: 'P', to: 'Q' },
      { from: 'R', to: 'S' },
    ];
    const cpm = computeCpm(acyclicOrder(ids, edges), edges, { P: 10, Q: 30, R: 5, S: 5 });
    expect(cpm.durationHours).toBe(40);
    expect(cpm.tasks['Q']).toMatchObject({ lf: 40, slack: 0, critical: true });
    expect(cpm.tasks['S']).toMatchObject({ lf: 40, ls: 35, es: 5, slack: 30, critical: false });
    expect(cpm.tasks['R']).toMatchObject({ ls: 30, slack: 30, critical: false });
    expect(cpm.criticalPath).toEqual(['P', 'Q']);
  });

  it('rejects non-integer or non-positive hours and mis-ordered input', () => {
    expect(() => computeCpm(['A'], [], { A: 1.5 })).toThrow(RangeError);
    expect(() => computeCpm(['A'], [], { A: 0 })).toThrow(RangeError);
    expect(() => computeCpm(['A'], [], {})).toThrow(RangeError);
    expect(() => computeCpm(['B', 'A'], [{ from: 'A', to: 'B' }], { A: 1, B: 1 })).toThrow(Error);
  });

  it('breaks priority ties by descendants, then code', () => {
    // X feeds P, Q, R which all feed Y. P, Q and R tie on slack and on descendants.
    const ids = ['X', 'P', 'Q', 'R', 'Y'];
    const edges: Edge[] = ['P', 'Q', 'R'].flatMap((m) => [
      { from: 'X', to: m },
      { from: m, to: 'Y' },
    ]);
    const hours = { X: 4, P: 8, Q: 8, R: 8, Y: 4 };
    const cpm = computeCpm(acyclicOrder(ids, edges), edges, hours);
    expect(priorityOrder(ids, edges, cpm)).toEqual(['X', 'P', 'Q', 'R', 'Y']);
  });

  it('prefers the task that unblocks more work when slack ties', () => {
    // Both M and N are critical (slack 0 in separate chains). M has two successors.
    const ids = ['M', 'N', 'M1', 'M2', 'N1'];
    const edges: Edge[] = [
      { from: 'M', to: 'M1' },
      { from: 'M', to: 'M2' },
      { from: 'N', to: 'N1' },
    ];
    const hours = { M: 5, N: 5, M1: 5, M2: 5, N1: 5 };
    const cpm = computeCpm(acyclicOrder(ids, edges), edges, hours);
    // Every task of the M group is critical (D = 10) and so is N-N1: slack 0 everywhere.
    expect(priorityOrder(ids, edges, cpm).slice(0, 2)).toEqual(['M', 'N']);
    // Make N's code sort first: M must still win because it has more descendants.
    const ids2 = ['Z', 'Y', 'Z1', 'Z2', 'Y1'];
    const edges2: Edge[] = [
      { from: 'Z', to: 'Z1' },
      { from: 'Z', to: 'Z2' },
      { from: 'Y', to: 'Y1' },
    ];
    const cpm2 = computeCpm(acyclicOrder(ids2, edges2), edges2, {
      Z: 5,
      Y: 5,
      Z1: 5,
      Z2: 5,
      Y1: 5,
    });
    expect(priorityOrder(ids2, edges2, cpm2).slice(0, 2)).toEqual(['Z', 'Y']);
  });
});

describe('E1: determinism under shuffled input', () => {
  const baseline = {
    acyclic: acyclicOrder(E1_IDS, E1_EDGES),
    cpm: e1Cpm(),
    order: priorityOrder(E1_IDS, E1_EDGES, e1Cpm()),
  };

  it('gives identical output for 25 shuffles of ids and edges', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const ids = shuffled(E1_IDS, seed);
      const edges = shuffled(E1_EDGES, seed * 7919);
      const tasks = shuffled(E1_TASKS, seed * 31);
      const topo = acyclicOrder(ids, edges);
      expect(topo).toEqual(baseline.acyclic);
      const cpm = computeCpm(topo, edges, hoursOf(tasks));
      expect(cpm).toEqual(baseline.cpm);
      const order = priorityOrder(ids, edges, cpm);
      expect(order).toEqual(baseline.order);
      const relaxed = packSprints(order, edges, tasks, RELAXED);
      expect(relaxed).toEqual(packSprints(baseline.order, E1_EDGES, E1_TASKS, RELAXED));
    }
  });

  it('keeps tie-heavy graphs stable too', () => {
    const ids = ['X', 'P', 'Q', 'R', 'S', 'T', 'Y'];
    const edges: Edge[] = ['P', 'Q', 'R', 'S', 'T'].flatMap((m) => [
      { from: 'X', to: m },
      { from: m, to: 'Y' },
    ]);
    const hours = Object.fromEntries(ids.map((id) => [id, 8]));
    const expected = ['X', 'P', 'Q', 'R', 'S', 'T', 'Y'];
    for (let seed = 1; seed <= 25; seed++) {
      const sIds = shuffled(ids, seed);
      const sEdges = shuffled(edges, seed + 100);
      const cpm = computeCpm(acyclicOrder(sIds, sEdges), sEdges, hours);
      expect(priorityOrder(sIds, sEdges, cpm)).toEqual(expected);
    }
  });

  it('schedulePlan output is identical for shuffled plan cores', () => {
    const base = schedulePlan(e1Core(), E1_CONFIG);
    for (let seed = 1; seed <= 25; seed++) {
      const core = e1Core();
      core.tasks = shuffled(core.tasks, seed);
      core.dependencies = shuffled(core.dependencies, seed * 13);
      expect(schedulePlan(core, E1_CONFIG)).toEqual(base);
    }
  });
});

describe('E1: schedulePlan end to end', () => {
  it('returns the plan.json schedule block for the 6-task graph', () => {
    const r = schedulePlan(e1Core(), E1_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.schedule;
    expect(s.unit).toBe('hours');
    expect(s.cpm).toEqual({
      duration_hours: 52,
      duration_days: 6.5,
      critical_path: ['A', 'B', 'D', 'F'],
    });
    expect(s.capacity_plan).toEqual({
      sprint_count: 2,
      duration_days: 10,
      capacity_points_per_sprint: 10,
      hours_per_sprint: 40,
    });
    expect(s.tasks.map((t) => t.task_id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(s.tasks.find((t) => t.task_id === 'C')).toEqual({
      task_id: 'C',
      es: 8,
      ef: 16,
      ls: 12,
      lf: 20,
      slack: 4,
      critical: false,
      sprint: 1,
      planned_start: 8,
      planned_finish: 16,
      descendants: 3,
    });
    expect(s.tasks.find((t) => t.task_id === 'F')).toMatchObject({
      sprint: 2,
      planned_start: 60,
      planned_finish: 72,
      descendants: 0,
    });
    expect(s.sprints).toEqual([
      {
        number: 1,
        load_points: 8,
        capacity_points: 10,
        utilisation: 0.8,
        task_ids: ['A', 'B', 'C', 'E'],
      },
      { number: 2, load_points: 8, capacity_points: 10, utilisation: 0.8, task_ids: ['D', 'F'] },
    ]);
  });

  it('honours pack_mode = strict', () => {
    const r = schedulePlan(e1Core(), { ...E1_CONFIG, pack_mode: 'strict' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.schedule.capacity_plan.sprint_count).toBe(4);
    expect(r.schedule.sprints.map((s) => s.task_ids)).toEqual([
      ['A'],
      ['B', 'C'],
      ['D', 'E'],
      ['F'],
    ]);
  });

  it('removes bad edges and reports them as issues', () => {
    const core = e1Core();
    core.dependencies.push(
      { from: 'A', to: 'A' },
      { from: 'A', to: 'B' },
      { from: 'A', to: 'NOPE' },
    );
    const r = schedulePlan(core, E1_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.issues.map((i) => i.kind)).toEqual([
      'self_loop',
      'duplicate_edge',
      'unknown_reference',
    ]);
    expect(r.dependencies).toEqual(E1_EDGES);
    expect(r.schedule.cpm.duration_hours).toBe(52);
  });
});

describe('known limitation: greedy packing anomaly (strict can beat relaxed)', () => {
  // MASTER_PLAN E1 lists "strict sprint count >= relaxed sprint count" as an invariant. It is
  // not a theorem: first-fit in a fixed order has bin-packing anomalies. Found by property
  // testing; about 1.4% of random DAGs show it. This pins the smallest case so the
  // behaviour is documented and any change to packing is noticed.
  const tasks: TaskInput[] = [
    { id: 'T0', points: 8, hours: 10 },
    { id: 'T1', points: 8, hours: 4 },
    { id: 'T2', points: 13, hours: 1 },
    { id: 'T3', points: 5, hours: 9 },
  ];
  const edges: Edge[] = [{ from: 'T1', to: 'T3' }];
  const ids = tasks.map((t) => t.id);

  it('relaxed needs 3 sprints where strict needs 2 (C = 18)', () => {
    const cpm = computeCpm(acyclicOrder(ids, edges), edges, hoursOf(tasks));
    const order = priorityOrder(ids, edges, cpm);
    expect(order).toEqual(['T1', 'T3', 'T0', 'T2']);
    const cfg = { capacityPoints: 18, sprintHours: 60 };
    const relaxed = packSprints(order, edges, tasks, { ...cfg, mode: 'relaxed' });
    const strict = packSprints(order, edges, tasks, { ...cfg, mode: 'strict' });
    expect(relaxed.sprints.map((s) => s.taskIds)).toEqual([['T1', 'T3'], ['T0'], ['T2']]);
    expect(strict.sprints.map((s) => s.taskIds)).toEqual([
      ['T1', 'T0'],
      ['T3', 'T2'],
    ]);
  });
});
