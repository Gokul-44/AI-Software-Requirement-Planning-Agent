import { describe, expect, it } from 'vitest';
import {
  PlanIntegrityError,
  PlanSchema,
  assertPlanIntegrity,
  findPlanIntegrityProblems,
  type Plan,
} from '../src/index.js';
import { validPlan } from './fixtures.js';

describe('PlanSchema', () => {
  it('accepts a valid plan', () => {
    const r = PlanSchema.safeParse(validPlan());
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });
  it('rejects a missing field', () => {
    const p: Record<string, unknown> = validPlan();
    delete p.coverage;
    expect(PlanSchema.safeParse(p).success).toBe(false);
  });
  it('rejects a wrong schema_version', () => {
    expect(PlanSchema.safeParse({ ...validPlan(), schema_version: '2.0' }).success).toBe(false);
  });
  it('rejects a bad enum', () => {
    const p = validPlan();
    (p.tasks[0] as { layer: string }).layer = 'mobile';
    expect(PlanSchema.safeParse(p).success).toBe(false);
  });
  it('rejects bad id patterns', () => {
    const p = validPlan();
    p.tasks[0]!.id = 'T-1';
    expect(PlanSchema.safeParse(p).success).toBe(false);
    const q = validPlan();
    q.signals[0]!.id = 'SG-1';
    expect(PlanSchema.safeParse(q).success).toBe(false);
  });
  it('rejects points outside the estimate scale', () => {
    const p = validPlan();
    (p.tasks[0] as { points: number }).points = 4;
    expect(PlanSchema.safeParse(p).success).toBe(false);
  });
  it('rejects a risk that cites no signal', () => {
    const p = validPlan();
    p.risks[0]!.signal_ids = [];
    expect(PlanSchema.safeParse(p).success).toBe(false);
  });
  it('rejects a config below the invariant', () => {
    const p = validPlan();
    p.run.config.team_size = 1;
    p.run.config.velocity_points_per_person = 5;
    expect(PlanSchema.safeParse(p).success).toBe(false);
  });
  it('rejects unknown properties', () => {
    expect(PlanSchema.safeParse({ ...validPlan(), extra: true }).success).toBe(false);
  });
});

describe('assertPlanIntegrity', () => {
  const mutate = (fn: (p: Plan) => void) => {
    const p = validPlan();
    fn(p);
    return p;
  };

  it('passes for a consistent plan (free-form issue refs are not checked)', () => {
    expect(() => assertPlanIntegrity(validPlan())).not.toThrow();
    expect(findPlanIntegrityProblems(validPlan())).toEqual([]);
  });

  const broken: [string, (p: Plan) => void, RegExp][] = [
    [
      'story points at an unknown epic',
      (p) => (p.stories[0]!.epic_id = 'E-009'),
      /unknown id E-009/,
    ],
    ['epic lists an unknown story', (p) => p.epics[0]!.story_ids.push('S-009'), /unknown id S-009/],
    [
      'task points at an unknown story',
      (p) => (p.tasks[0]!.story_id = 'S-009'),
      /unknown id S-009/,
    ],
    [
      'story lists an unknown requirement',
      (p) => p.stories[0]!.requirement_ids.push('R-009'),
      /unknown id R-009/,
    ],
    [
      'task lists an unknown requirement',
      (p) => p.tasks[0]!.requirement_ids.push('R-009'),
      /unknown id R-009/,
    ],
    [
      'requirement lists an unknown task',
      (p) => p.requirements[0]!.task_ids.push('T-009'),
      /unknown id T-009/,
    ],
    [
      'dependency endpoint is unknown',
      (p) => (p.dependencies[0]!.to = 'T-009'),
      /unknown id T-009/,
    ],
    ['dependency is a self loop', (p) => (p.dependencies[0]!.to = 'T-001'), /self loop/],
    [
      'dependency is duplicated',
      (p) => p.dependencies.push({ ...p.dependencies[0]! }),
      /Duplicate dependency/,
    ],
    [
      'schedule entry is unknown',
      (p) => (p.schedule.tasks[0]!.task_id = 'T-009'),
      /unknown id T-009/,
    ],
    [
      'task missing from the schedule',
      (p) => p.schedule.tasks.pop(),
      /no entry in schedule\.tasks/,
    ],
    [
      'sprint lists an unknown task',
      (p) => p.schedule.sprints[0]!.task_ids.push('T-009'),
      /unknown id T-009/,
    ],
    [
      'task sprint disagrees with sprint list',
      (p) => (p.schedule.tasks[0]!.sprint = 2),
      /listed in sprint 1/,
    ],
    [
      'critical path names an unknown task',
      (p) => p.schedule.cpm.critical_path.push('T-009'),
      /unknown id T-009/,
    ],
    [
      'signal names an unknown task',
      (p) => p.signals[0]!.task_ids.push('T-009'),
      /unknown id T-009/,
    ],
    [
      'risk cites an unknown signal',
      (p) => (p.risks[0]!.signal_ids = ['SG-09']),
      /unknown id SG-09/,
    ],
    [
      'coverage names an unknown requirement',
      (p) => p.coverage.uncovered_requirement_ids.push('R-009'),
      /unknown id R-009/,
    ],
    ['duplicate task id', (p) => p.tasks.push({ ...p.tasks[0]! }), /Duplicate task id T-001/],
    [
      'one-way requirement to story link',
      (p) => (p.stories[0]!.requirement_ids = []),
      /does not list R-001/,
    ],
    ['story and epic disagree', (p) => (p.epics[0]!.story_ids = ['S-001']), /does not list it/],
  ];

  it.each(broken)('fails when %s', (_name, fn, pattern) => {
    const p = mutate(fn);
    expect(PlanSchema.safeParse(p).success, 'mutation must keep the plan schema-valid').toBe(true);
    const problems = findPlanIntegrityProblems(p);
    expect(problems.join('\n')).toMatch(pattern);
    expect(() => assertPlanIntegrity(p)).toThrow(PlanIntegrityError);
  });
});
