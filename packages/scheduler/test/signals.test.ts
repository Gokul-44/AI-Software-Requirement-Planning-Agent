import { ScheduleSchema, SignalSchema } from '@spm/shared';
import type { Signal } from '@spm/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  computeCoverage,
  computeSignals,
  findDuplicateTitles,
  jaccard,
  normaliseTitle,
  requirementsWithoutStory,
  requirementsWithoutTask,
  schedulePlan,
  storiesWithoutTasks,
  titleSimilarity,
} from '../src/index.js';
import type { PlanCore } from '../src/index.js';
import { BIG_CONFIG, E1_CONFIG, e1Core, makeCore } from './helpers.js';
import type { TaskSpec } from './helpers.js';

function run(core: PlanCore, config = BIG_CONFIG): Signal[] {
  const r = schedulePlan(core, config);
  if (!r.ok) throw new Error('expected an acyclic plan');
  return r.signals;
}

const ofKind = (signals: Signal[], kind: Signal['kind']) => signals.filter((s) => s.kind === kind);

const ids = (...names: string[]): TaskSpec[] => names.map((id) => ({ id }));

describe('signals on the E1 graph', () => {
  it('emits exactly the expected set, with sequential ids and code-computed severity', () => {
    const signals = run(e1Core(), E1_CONFIG);
    expect(signals.map((s) => [s.id, s.kind, s.severity])).toEqual([
      ['SG-01', 'critical_path_length', 'high'],
      ['SG-02', 'critical_high_fanout', 'high'],
      ['SG-03', 'capacity_bound', 'medium'],
      ['SG-04', 'layer_imbalance', 'medium'],
      ['SG-05', 'critical_layer_concentration', 'medium'],
    ]);
  });

  it('carries numeric values, thresholds and numeric messages', () => {
    const [cp, fan, cap, imb, conc] = run(e1Core(), E1_CONFIG);
    expect(cp?.value).toBeCloseTo(4 / 6, 3);
    expect(cp?.threshold).toBe(0.4);
    expect(cp?.task_ids).toEqual(['A', 'B', 'D', 'F']);
    expect(cp?.message).toBe(
      'CPM duration is 52 h (6.5 working days); 4 of 6 tasks (67%) are critical.',
    );

    expect(fan).toMatchObject({ value: 5, threshold: 5, task_ids: ['A'] });
    expect(fan?.message).toBe('A "Task A" has 5 downstream tasks and 0 h slack (CPM).');

    expect(cap?.value).toBeCloseTo(80 / 52, 3);
    expect(cap?.threshold).toBe(1.5);
    expect(cap?.message).toBe(
      'Capacity-feasible plan is 80 h (2 sprints) against a CPM minimum of 52 h: ratio 1.54x.',
    );

    expect(imb).toMatchObject({ value: 0, threshold: 1, task_ids: [] });
    expect(imb?.message).toBe('The plan has no devops tasks (0 of 6 tasks).');

    expect(conc?.value).toBeCloseTo(40 / 52, 3);
    expect(conc?.threshold).toBe(0.6);
    expect(conc?.task_ids).toEqual(['A', 'B', 'D']);
    expect(conc?.message).toBe('Layer backend holds 40 of 52 critical-path hours (77%).');
  });

  it('produces output that satisfies the plan.json schemas', () => {
    const core = e1Core();
    const rename = (id: string) => `T-00${'ABCDEF'.indexOf(id) + 1}`;
    for (const t of core.tasks) t.id = rename(t.id);
    for (const d of core.dependencies) {
      d.from = rename(d.from);
      d.to = rename(d.to);
    }
    const r = schedulePlan(core, E1_CONFIG);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ScheduleSchema.safeParse(r.schedule).success).toBe(true);
    for (const s of r.signals) expect(SignalSchema.safeParse(s).success).toBe(true);
  });

  it('respects custom thresholds', () => {
    const r = schedulePlan(e1Core(), E1_CONFIG);
    if (!r.ok) throw new Error('expected a DAG');
    const strictThresholds = computeSignals(
      { ...e1Core(), schedule: r.schedule },
      { criticalFanoutHigh: 2, overloadMedium: 0.8 },
    );
    // B (2 descendants) now also counts; both sprints sit at 0.80 utilisation.
    expect(ofKind(strictThresholds, 'critical_high_fanout').map((s) => s.task_ids)).toEqual([
      ['A'],
      ['B'],
    ]);
    expect(ofKind(strictThresholds, 'sprint_overload')).toHaveLength(2);
    expect(DEFAULT_THRESHOLDS.criticalFanoutHigh).toBe(5);
  });
});

describe('critical_path_length', () => {
  const filler = (n: number): TaskSpec[] =>
    Array.from({ length: n }, (_, i) => ({ id: `I${i + 1}`, hours: 1, points: 1 }));
  const chain: TaskSpec[] = [
    { id: 'A', hours: 10 },
    { id: 'B', hours: 10 },
  ];

  it('is medium at a 25% critical share', () => {
    // 2 critical tasks of 8.
    const cp = ofKind(
      run(makeCore([...chain, ...filler(6)], [['A', 'B']])),
      'critical_path_length',
    );
    expect(cp[0]).toMatchObject({ severity: 'medium', value: 0.25, threshold: 0.25 });
  });

  it('is low below 25%, with no threshold reached', () => {
    // 2 critical tasks of 10.
    const cp = ofKind(
      run(makeCore([...chain, ...filler(8)], [['A', 'B']])),
      'critical_path_length',
    );
    expect(cp[0]).toMatchObject({ severity: 'low', value: 0.2, threshold: null });
  });
});

describe('critical_high_fanout', () => {
  it('flags a critical task with at least 5 transitive descendants only', () => {
    const fan = (n: number) =>
      run(
        makeCore(
          ids('R', ...Array.from({ length: n }, (_, i) => `L${i}`)),
          Array.from({ length: n }, (_, i) => ['R', `L${i}`] as [string, string]),
        ),
      );
    expect(ofKind(fan(4), 'critical_high_fanout')).toHaveLength(0);
    expect(ofKind(fan(5), 'critical_high_fanout')).toHaveLength(1);
  });

  it('ignores a non-critical task however many tasks it feeds', () => {
    // N is a side branch with slack but 5 successors; the long chain makes it non-critical.
    const specs: TaskSpec[] = [
      { id: 'LONG', hours: 40 },
      { id: 'N', hours: 4 },
      ...['M1', 'M2', 'M3', 'M4', 'M5'].map((id) => ({ id, hours: 4 })),
    ];
    const edges: [string, string][] = ['M1', 'M2', 'M3', 'M4', 'M5'].map((m) => ['N', m]);
    const signals = run(makeCore(specs, edges), { ...BIG_CONFIG, sprint_length_days: 20 });
    expect(ofKind(signals, 'critical_high_fanout')).toHaveLength(0);
  });
});

describe('high_fan_in', () => {
  it('flags a task with 4 or more direct predecessors (medium)', () => {
    const four = run(
      makeCore(ids('P1', 'P2', 'P3', 'P4', 'J'), [
        ['P1', 'J'],
        ['P2', 'J'],
        ['P3', 'J'],
        ['P4', 'J'],
      ]),
    );
    const sig = ofKind(four, 'high_fan_in');
    expect(sig).toHaveLength(1);
    expect(sig[0]).toMatchObject({ severity: 'medium', value: 4, threshold: 4, task_ids: ['J'] });
    expect(sig[0]?.message).toBe('J "Task J" has 4 direct predecessors (integration bottleneck).');

    const three = run(
      makeCore(ids('P1', 'P2', 'P3', 'J'), [
        ['P1', 'J'],
        ['P2', 'J'],
        ['P3', 'J'],
      ]),
    );
    expect(ofKind(three, 'high_fan_in')).toHaveLength(0);
  });
});

describe('sprint_overload', () => {
  const pts = (...points: (1 | 2 | 3 | 5 | 8 | 13)[]): TaskSpec[] =>
    points.map((p, i) => ({ id: `X${i}`, points: p, hours: p * 4 }));

  it('is medium at exactly 0.90 and high at exactly 0.98', () => {
    // C = 50. 45 points = 0.90.
    const medium = ofKind(run(makeCore(pts(13, 13, 13, 5, 1))), 'sprint_overload');
    expect(medium).toHaveLength(1);
    expect(medium[0]).toMatchObject({ severity: 'medium', value: 0.9, threshold: 0.9 });
    expect(medium[0]?.message).toBe('Sprint 1 is loaded to 90% (45 of 50 points).');
    // 49 points = 0.98.
    const high = ofKind(run(makeCore(pts(13, 13, 13, 8, 2))), 'sprint_overload');
    expect(high[0]).toMatchObject({ severity: 'high', value: 0.98, threshold: 0.98 });
    expect(high[0]?.task_ids).toHaveLength(5);
  });

  it('does not fire below 0.90', () => {
    expect(ofKind(run(makeCore(pts(13, 13, 13, 5))), 'sprint_overload')).toHaveLength(0);
  });
});

describe('sprint_imbalance', () => {
  function schedule(loads: number[], capacity = 10) {
    return {
      unit: 'hours' as const,
      cpm: { duration_hours: 10, duration_days: 1, critical_path: [] },
      capacity_plan: {
        sprint_count: loads.length,
        duration_days: loads.length * 10,
        capacity_points_per_sprint: capacity,
        hours_per_sprint: 60,
      },
      tasks: [],
      sprints: loads.map((l, i) => ({
        number: i + 1,
        load_points: l,
        capacity_points: capacity,
        utilisation: l / capacity,
        task_ids: [],
      })),
    };
  }
  const withSchedule = (loads: number[]) => ({ ...makeCore([]), schedule: schedule(loads) });

  it('flags a CV of at least 0.35, excluding the last sprint (low)', () => {
    const s = ofKind(computeSignals(withSchedule([10, 2, 5])), 'sprint_imbalance');
    expect(s).toHaveLength(1);
    // Utilisation 1.0 and 0.2: mean 0.6, population sd 0.4, CV 0.667.
    expect(s[0]).toMatchObject({ severity: 'low', threshold: 0.35 });
    expect(s[0]?.value).toBeCloseTo(0.6667, 3);
    expect(s[0]?.message).toBe(
      'Utilisation varies across sprints 1-2 (coefficient of variation 0.67, last sprint excluded).',
    );
  });

  it('ignores the last sprint and needs two other sprints', () => {
    expect(ofKind(computeSignals(withSchedule([10, 9, 1])), 'sprint_imbalance')).toHaveLength(0);
    expect(ofKind(computeSignals(withSchedule([10, 1])), 'sprint_imbalance')).toHaveLength(0);
    expect(ofKind(computeSignals(withSchedule([10])), 'sprint_imbalance')).toHaveLength(0);
  });
});

describe('isolated_task', () => {
  const chain: [string, string][] = [
    ['A', 'B'],
    ['B', 'C'],
  ];

  it('is low for one or two isolated tasks and medium from three', () => {
    const two = ofKind(run(makeCore(ids('A', 'B', 'C', 'Y', 'X'), chain)), 'isolated_task');
    expect(two).toHaveLength(1);
    expect(two[0]).toMatchObject({ severity: 'low', value: 2, task_ids: ['X', 'Y'] });

    const three = ofKind(run(makeCore(ids('A', 'B', 'C', 'Y', 'X', 'Z'), chain)), 'isolated_task');
    expect(three[0]).toMatchObject({ severity: 'medium', value: 3, task_ids: ['X', 'Y', 'Z'] });
    expect(three[0]?.message).toBe('3 tasks have no predecessors and no successors: X, Y, Z.');
  });

  it('does not flag tasks that only start or only end the project', () => {
    expect(ofKind(run(makeCore(ids('A', 'B', 'C'), chain)), 'isolated_task')).toHaveLength(0);
  });

  it('does not flag a one-task plan', () => {
    expect(ofKind(run(makeCore(ids('A'))), 'isolated_task')).toHaveLength(0);
  });
});

describe('layer_anomaly', () => {
  it('flags testing and deploy-type devops tasks that have no predecessor (low)', () => {
    const specs: TaskSpec[] = [
      { id: 'A' },
      { id: 'T1', layer: 'testing' },
      { id: 'T2', layer: 'testing' },
      { id: 'D1', layer: 'devops', title: 'Deploy the service to production' },
      { id: 'D2', layer: 'devops', title: 'Set up continuous integration' },
    ];
    const edges: [string, string][] = [
      ['A', 'T2'],
      ['A', 'D2'],
    ];
    const s = ofKind(run(makeCore(specs, edges)), 'layer_anomaly');
    expect(s.map((x) => x.task_ids)).toEqual([['D1'], ['T1']]);
    expect(s.every((x) => x.severity === 'low')).toBe(true);
    expect(s[1]?.message).toBe('T1 "Task T1" is a testing task with no predecessor.');
  });
});

describe('layer_imbalance', () => {
  it('flags a testing share below 10% of points (medium)', () => {
    const specs: TaskSpec[] = [
      { id: 'A', points: 13 },
      { id: 'B', points: 13 },
      { id: 'T', points: 1, layer: 'testing' },
      { id: 'O', points: 1, layer: 'devops' },
    ];
    const s = ofKind(run(makeCore(specs, [['A', 'B']])), 'layer_imbalance');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ severity: 'medium', threshold: 0.1 });
    expect(s[0]?.value).toBeCloseTo(1 / 28, 3);
    expect(s[0]?.message).toBe('Testing is 1 of 28 points (3.6%), below the 10% minimum.');
  });

  it('flags a plan with no devops tasks and can emit both findings', () => {
    const specs: TaskSpec[] = [
      { id: 'A', points: 13 },
      { id: 'B', points: 8 },
    ];
    const s = ofKind(run(makeCore(specs, [['A', 'B']])), 'layer_imbalance');
    expect(s.map((x) => x.message)).toEqual([
      'Testing is 0 of 21 points (0.0%), below the 10% minimum.',
      'The plan has no devops tasks (0 of 2 tasks).',
    ]);
  });

  it('stays silent when testing is at least 10% and devops exists', () => {
    const specs: TaskSpec[] = [
      { id: 'A', points: 5 },
      { id: 'T', points: 1, layer: 'testing' },
      { id: 'O', points: 1, layer: 'devops' },
    ];
    expect(ofKind(run(makeCore(specs, [['A', 'T']])), 'layer_imbalance')).toHaveLength(0);
  });
});

describe('uncovered_requirement', () => {
  const core = (): PlanCore => ({
    requirements: [
      { id: 'R-001', priority: 'must' },
      { id: 'R-002', priority: 'must' },
      { id: 'R-003', priority: 'should' },
      { id: 'R-004', priority: 'could' },
    ],
    stories: [
      { id: 'S-001', requirement_ids: ['R-001'] },
      { id: 'S-002', requirement_ids: ['R-003'] },
      { id: 'S-003', requirement_ids: ['R-001', 'R-004'] },
    ],
    tasks: [
      { id: 'T-001', story_id: 'S-001', title: 'One', layer: 'backend', points: 3, hours: 12 },
      { id: 'T-002', story_id: 'S-003', title: 'Two', layer: 'backend', points: 3, hours: 12 },
    ],
    dependencies: [],
  });

  it('exposes the coverage helpers (C1, C2, C3)', () => {
    expect(requirementsWithoutStory(core())).toEqual(['R-002']);
    expect(storiesWithoutTasks(core())).toEqual(['S-002']);
    expect(requirementsWithoutTask(core())).toEqual(['R-002', 'R-003']);
    expect(computeCoverage(core())).toEqual({
      requirements_total: 4,
      requirements_with_story: 3,
      requirements_with_task: 2,
      uncovered_requirement_ids: ['R-002', 'R-003'],
      stories_without_tasks: ['S-002'],
    });
  });

  it('computes severity from priority: must is high, others are medium', () => {
    const s = ofKind(run(core()), 'uncovered_requirement');
    expect(s.map((x) => [x.severity, x.message])).toEqual([
      ['high', 'R-002 (must) has no story, so no task can trace to it.'],
      ['medium', 'R-003 (should) has stories but no tasks.'],
    ]);
    expect(s.every((x) => x.value === 0 && x.task_ids.length === 0)).toBe(true);
  });

  it('treats an empty plan as fully covered', () => {
    expect(computeCoverage({ requirements: [], stories: [], tasks: [] })).toEqual({
      requirements_total: 0,
      requirements_with_story: 0,
      requirements_with_task: 0,
      uncovered_requirement_ids: [],
      stories_without_tasks: [],
    });
  });

  it('is returned by schedulePlan as coverage', () => {
    const r = schedulePlan(core(), BIG_CONFIG);
    expect(r.ok && r.coverage.uncovered_requirement_ids).toEqual(['R-002', 'R-003']);
  });
});

describe('oversized_task', () => {
  it('flags every 13-point task (medium)', () => {
    const specs: TaskSpec[] = [
      { id: 'A', points: 13 },
      { id: 'B', points: 8 },
      { id: 'C', points: 13 },
    ];
    const s = ofKind(run(makeCore(specs, [['A', 'B']])), 'oversized_task');
    expect(s.map((x) => x.task_ids)).toEqual([['A'], ['C']]);
    expect(s[0]).toMatchObject({ severity: 'medium', value: 13, threshold: 13 });
    expect(s[0]?.message).toBe('A "Task A" is estimated at 13 points and should be split.');
  });
});

describe('cycle_repaired', () => {
  it('reports the removed edges as one medium signal', () => {
    const core = makeCore(ids('A', 'B', 'C'), [['A', 'B']], {
      repaired_edges: [
        { from: 'B', to: 'A' },
        { from: 'C', to: 'A' },
      ],
    });
    const s = ofKind(run(core), 'cycle_repaired');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ severity: 'medium', value: 2, task_ids: ['A', 'B', 'C'] });
    expect(s[0]?.message).toBe('2 edges were removed to break cycles: B->A, C->A.');
  });

  it('is absent when no edge was repaired', () => {
    expect(ofKind(run(e1Core(), E1_CONFIG), 'cycle_repaired')).toHaveLength(0);
  });
});

describe('duplicate_task_suspect', () => {
  it('flags title pairs with Jaccard >= 0.8 (low)', () => {
    const specs: TaskSpec[] = [
      { id: 'A', title: 'Implement user login page' },
      { id: 'B', title: 'Implement the user login page' },
      { id: 'C', title: 'Implement user logout page' },
    ];
    const s = ofKind(run(makeCore(specs)), 'duplicate_task_suspect');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      severity: 'low',
      value: 0.8,
      threshold: 0.8,
      task_ids: ['A', 'B'],
    });
    expect(s[0]?.message).toBe(
      'A "Implement user login page" and B "Implement the user login page" have title similarity 0.80.',
    );
  });

  it('caps the number of signals so ids stay within SG-999', () => {
    const specs: TaskSpec[] = Array.from({ length: 40 }, (_, i) => ({
      id: `T${String(i).padStart(2, '0')}`,
      title: 'Write the same thing',
      points: 1,
      hours: 4,
    }));
    const s = ofKind(run(makeCore(specs)), 'duplicate_task_suspect');
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(25);
  });
});

describe('title similarity', () => {
  it('normalises case, punctuation, accents and spacing', () => {
    expect(normaliseTitle('  Set-up  CI/CD, pipeline!  ')).toEqual([
      'cd',
      'ci',
      'pipeline',
      'set',
      'up',
    ]);
    expect(normaliseTitle('Café Menü')).toEqual(['cafe', 'menu']);
    expect(normaliseTitle('login login')).toEqual(['login']);
    expect(normaliseTitle('')).toEqual([]);
  });

  it('computes Jaccard on token sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(jaccard(new Set(['a', 'b']), new Set(['c']))).toBe(0);
    expect(jaccard(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBe(0.5);
    expect(jaccard(new Set(), new Set())).toBe(0);
    expect(titleSimilarity('Add Login', 'add login!')).toBe(1);
  });

  it('finds duplicate pairs in a list, sorted by similarity then ids', () => {
    const pairs = findDuplicateTitles([
      { id: 'T-003', title: 'Create the order table' },
      { id: 'T-001', title: 'Create order table' },
      { id: 'T-002', title: 'Create order table' },
      { id: 'T-004', title: 'Build the payment form' },
      { id: 'T-005', title: 'create order table.' },
    ]);
    // "create the order table" shares 3 of 4 tokens (0.75), below the 0.8 default.
    expect(pairs).toEqual([
      { a: 'T-001', b: 'T-002', similarity: 1 },
      { a: 'T-001', b: 'T-005', similarity: 1 },
      { a: 'T-002', b: 'T-005', similarity: 1 },
    ]);
    expect(
      findDuplicateTitles(
        [
          { id: 'T-001', title: 'A b' },
          { id: 'T-002', title: 'a c' },
        ],
        0.3,
      ),
    ).toEqual([{ a: 'T-001', b: 'T-002', similarity: 0.3333 }]);
  });
});
