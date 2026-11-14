import type { Config } from '@spm/shared';
import type { Edge, PlanCore, TaskInput } from '../src/index.js';

/** The hand-built 6-task graph from design document E1 (points to hours at 4 h/point). */
export const E1_TASKS: (TaskInput & { points: 1 | 2 | 3 | 5 | 8 | 13 })[] = [
  { id: 'A', points: 2, hours: 8 },
  { id: 'B', points: 3, hours: 12 },
  { id: 'C', points: 2, hours: 8 },
  { id: 'D', points: 5, hours: 20 },
  { id: 'E', points: 1, hours: 4 },
  { id: 'F', points: 3, hours: 12 },
];

export const E1_EDGES: Edge[] = [
  { from: 'A', to: 'B' },
  { from: 'A', to: 'C' },
  { from: 'B', to: 'D' },
  { from: 'C', to: 'D' },
  { from: 'C', to: 'E' },
  { from: 'D', to: 'F' },
  { from: 'E', to: 'F' },
];

export const E1_IDS = E1_TASKS.map((t) => t.id);

export const E1_HOURS: Record<string, number> = Object.fromEntries(
  E1_TASKS.map((t) => [t.id, t.hours]),
);

export function hoursOf(tasks: TaskInput[]): Record<string, number> {
  return Object.fromEntries(tasks.map((t) => [t.id, t.hours]));
}

/** Deterministic Fisher-Yates shuffle (mulberry32), so a failing seed can be replayed. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/** A Config with C = 10 points and H = 40 h per sprint (the E1 packing setup). */
export const E1_CONFIG: Config = {
  team_size: 1,
  velocity_points_per_person: 10,
  sprint_length_days: 5,
  focus_hours_per_day: 8,
  points_to_hours: { '1': 4, '2': 8, '3': 12, '5': 20, '8': 32, '13': 52 },
  pack_mode: 'relaxed',
};

const E1_LAYERS: Record<string, PlanCore['tasks'][number]['layer']> = {
  A: 'backend',
  B: 'backend',
  C: 'frontend',
  D: 'backend',
  E: 'frontend',
  F: 'testing',
};

/** E1 as a plan core: one requirement, one story, every task in that story. */
export function e1Core(): PlanCore {
  return {
    requirements: [{ id: 'R-001', priority: 'must' }],
    stories: [{ id: 'S-001', requirement_ids: ['R-001'] }],
    tasks: E1_TASKS.map((t) => ({
      id: t.id,
      story_id: 'S-001',
      title: `Task ${t.id}`,
      layer: E1_LAYERS[t.id] ?? 'backend',
      points: t.points,
      hours: t.hours,
    })),
    dependencies: E1_EDGES.map((e) => ({ ...e })),
  };
}

type CoreTask = PlanCore['tasks'][number];

export interface TaskSpec {
  id: string;
  points?: CoreTask['points'];
  hours?: number;
  layer?: CoreTask['layer'];
  title?: string;
  story?: string;
}

/** Builds a plan core for signal tests. Defaults: 3 points, 12 h, backend, one story S-001. */
export function makeCore(
  specs: TaskSpec[],
  edges: [string, string][] = [],
  extra: Partial<PlanCore> = {},
): PlanCore {
  return {
    requirements: [{ id: 'R-001', priority: 'must' }],
    stories: [{ id: 'S-001', requirement_ids: ['R-001'] }],
    tasks: specs.map((s) => ({
      id: s.id,
      story_id: s.story ?? 'S-001',
      title: s.title ?? `Task ${s.id}`,
      layer: s.layer ?? 'backend',
      points: s.points ?? 3,
      hours: s.hours ?? 12,
    })),
    dependencies: edges.map(([from, to]) => ({ from, to })),
    ...extra,
  };
}

/** Roomy config (C = 50 points, H = 60 h) so that signal tests never hit the guard. */
export const BIG_CONFIG: Config = {
  team_size: 5,
  velocity_points_per_person: 10,
  sprint_length_days: 10,
  focus_hours_per_day: 6,
  points_to_hours: { '1': 4, '2': 8, '3': 12, '5': 20, '8': 32, '13': 52 },
  pack_mode: 'relaxed',
};
