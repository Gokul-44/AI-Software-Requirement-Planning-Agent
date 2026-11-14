import { DependenciesOutputSchema } from '@spm/shared';
import type { CycleInfo, DependenciesOutput, Issue, Layer } from '@spm/shared';
import type { DependencyRow, IssueDraft } from '../db/repository.js';
import {
  PROMPT_VERSIONS,
  stage5CrossSystem,
  stage5RepairSystem,
  stage5RepairUser,
  stage5System,
  stage5User,
} from '../prompts/index.js';
import type { DependencyTask, Stage5Input, Stage5RepairInput } from './inputs.js';
import { bestEffort, tracked } from './support.js';
import type { StageContext } from './support.js';

/** B3.6: one call up to this many tasks, per-epic calls plus one cross-epic call above it. */
export const SINGLE_CALL_MAX_TASKS = 80;
const MAX_OUTPUT_TOKENS = 8192;
const MAX_SUSPICIOUS_ISSUES = 25;

export type EdgeRef = { from: string; to: string };
export const edgeKey = (e: EdgeRef) => `${e.from}->${e.to}`;

/** The LLM writes "task_id depends_on [...]"; code turns each entry into edges depends_on -> task_id. */
export function outputToEdges(
  out: DependenciesOutput,
  source: DependencyRow['source'] = 'llm',
): DependencyRow[] {
  return out.dependencies.flatMap((d) =>
    d.depends_on.map((from) => ({ from, to: d.task_id, source, reason: d.reason })),
  );
}

// ---------------------------------------------------------------- proposing

/**
 * Stage 5 proposals. Returns one edge list per LLM call, in call order. Edges are NOT validated
 * here: unknown ids, self-loops and duplicates are reported by validateEdges afterwards.
 */
export async function proposeEdges(
  ctx: StageContext,
  tasks: DependencyTask[],
  epics: { id: string; title: string }[],
): Promise<DependencyRow[][]> {
  const call = async (
    input: Stage5Input,
    system: string,
    schemaName: string,
  ): Promise<DependencyRow[]> => {
    const result = await tracked(ctx, {
      stage: 5,
      promptVersion: PROMPT_VERSIONS[5],
      system,
      user: stage5User(input),
      input,
      schema: DependenciesOutputSchema,
      schemaName,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
    return outputToEdges(result.value);
  };

  if (tasks.length <= SINGLE_CALL_MAX_TASKS) {
    return [await call({ scope: 'all', tasks, epics }, stage5System('all'), 'Dependencies')];
  }

  const passes: DependencyRow[][] = [];
  // Pass A: intra-epic edges, one epic at a time (the free tier allows few requests a minute).
  for (const epic of epics) {
    const own = tasks.filter((t) => t.epic_id === epic.id);
    if (own.length < 2) continue;
    passes.push(
      await call(
        { scope: 'epic', tasks: own, epics: [epic] },
        stage5System('epic'),
        'DependenciesEpic',
      ),
    );
  }
  // Pass B: one call over all tasks, edges between epics only.
  const epicOf = new Map(tasks.map((t) => [t.id, t.epic_id]));
  const sorted = [...tasks].sort(
    (a, b) => a.epic_id.localeCompare(b.epic_id) || a.id.localeCompare(b.id),
  );
  const cross = await call(
    { scope: 'cross', tasks: sorted, epics },
    stage5CrossSystem(),
    'DependenciesCross',
  );
  // Edges inside one epic belong to pass A. Unknown ids stay: validateEdges reports them.
  passes.push(
    cross.filter((e) => {
      const a = epicOf.get(e.from);
      const b = epicOf.get(e.to);
      return a === undefined || b === undefined || a !== b;
    }),
  );
  return passes;
}

/**
 * Concatenates the passes. A pair that an earlier pass already has is dropped silently (the two
 * passes agreeing is not a defect); a pair repeated inside one pass is kept for validateEdges.
 */
export function mergePasses(passes: DependencyRow[][]): DependencyRow[] {
  const earlier = new Set<string>();
  const merged: DependencyRow[] = [];
  for (const pass of passes) {
    const thisPass = new Set<string>();
    for (const e of pass) {
      const key = edgeKey(e);
      if (earlier.has(key)) continue;
      thisPass.add(key);
      merged.push(e);
    }
    for (const key of thisPass) earlier.add(key);
  }
  return merged;
}

// ---------------------------------------------------------------- issues

export function toIssueDraft(issue: Issue): IssueDraft {
  return {
    stage: issue.stage,
    severity: issue.severity,
    kind: issue.kind,
    message: issue.message,
    refs: issue.refs,
    resolution: issue.resolution,
  };
}

/** Usual build order. An edge from a later layer to an earlier one runs against it. */
const LAYER_ORDER: Partial<Record<Layer, number>> = {
  design: 0,
  database: 1,
  backend: 2,
  integration: 2,
  frontend: 3,
  testing: 4,
};

/**
 * B1 Issue 6: an edge `from -> to` where `from` is later in the usual layer order than `to`
 * (for example a database task waiting for a frontend task) is kept but flagged.
 */
export function suspiciousEdges(
  edges: readonly DependencyRow[],
  layerOf: ReadonlyMap<string, Layer>,
): IssueDraft[] {
  const found: IssueDraft[] = [];
  let total = 0;
  for (const e of edges) {
    const a = layerOf.get(e.from);
    const b = layerOf.get(e.to);
    if (a === undefined || b === undefined) continue;
    const ra = LAYER_ORDER[a];
    const rb = LAYER_ORDER[b];
    if (ra === undefined || rb === undefined || ra <= rb) continue;
    total += 1;
    if (found.length < MAX_SUSPICIOUS_ISSUES) {
      found.push({
        stage: 5,
        severity: 'warning',
        kind: 'suspicious_edge',
        message: `${e.to} (${b}) waits for ${e.from} (${a}), which is against the usual order of layers.`,
        refs: [e.from, e.to],
        resolution: 'Kept: such an edge is sometimes legitimate.',
      });
    }
  }
  if (total > found.length) {
    found.push({
      stage: 5,
      severity: 'info',
      kind: 'suspicious_edge',
      message: `${total - found.length} more edges run against the usual order of layers and are not listed.`,
      refs: [],
      resolution: null,
    });
  }
  return found;
}

// ---------------------------------------------------------------- cycles

/** The part of the run's dependency graph a user has to look at: every cycle task and the edges among them. */
export function cycleInfo(cycles: string[][], edges: readonly DependencyRow[]): CycleInfo {
  const groupOf = new Map<string, number>();
  cycles.forEach((members, i) => members.forEach((id) => groupOf.set(id, i)));
  const inside = edges.filter((e) => {
    const g = groupOf.get(e.from);
    return g !== undefined && g === groupOf.get(e.to);
  });
  return {
    task_ids: [...groupOf.keys()].sort(),
    edges: inside.map((e) => ({ from: e.from, to: e.to })),
  };
}

export function cycleIssues(cyclePaths: string[][]): IssueDraft[] {
  return cyclePaths.map((path) => ({
    stage: 5,
    severity: 'error',
    kind: 'cycle',
    message: `Dependency cycle ${path.join(' -> ')}. The plan cannot be scheduled until one of its edges is removed.`,
    refs: [...new Set(path)],
    resolution: null,
  }));
}

export interface RepairResult {
  /** The complete edge list after the repair. */
  edges: DependencyRow[];
  /** Edges that were in a cycle and are gone now. */
  removed: DependencyRow[];
  /** Proposed edges that were not between two tasks of the same cycle. */
  discarded: number;
}

/**
 * B1 Issue 3, automatic step: ONE LLM call that sees only the tasks and edges of each cycle
 * (SCC) and returns a corrected edge set for them. Edges outside the cycles are never touched.
 * Returns null when the model could not produce valid output.
 */
export async function repairCycles(
  ctx: StageContext,
  tasks: readonly { id: string; title: string; layer: Layer }[],
  edges: readonly DependencyRow[],
  cycles: string[][],
): Promise<RepairResult | null> {
  const groupOf = new Map<string, number>();
  cycles.forEach((members, i) => members.forEach((id) => groupOf.set(id, i)));
  const sameCycle = (e: EdgeRef) => {
    const g = groupOf.get(e.from);
    return g !== undefined && g === groupOf.get(e.to);
  };
  const inside = edges.filter(sameCycle);
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const input: Stage5RepairInput = {
    groups: cycles.map((members, i) => {
      const own = new Map<string, string[]>();
      for (const e of inside) {
        if (groupOf.get(e.from) !== i) continue;
        own.set(e.to, [...(own.get(e.to) ?? []), e.from]);
      }
      return {
        tasks: [...members].sort().flatMap((id) => {
          const t = taskById.get(id);
          return t ? [{ id: t.id, title: t.title, layer: t.layer }] : [];
        }),
        dependencies: [...own.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([task_id, depends_on]) => ({ task_id, depends_on: depends_on.sort() })),
      };
    }),
  };

  const result = await bestEffort(ctx, () =>
    tracked(ctx, {
      stage: 5,
      promptVersion: PROMPT_VERSIONS[5],
      system: stage5RepairSystem(),
      user: stage5RepairUser(input),
      input,
      schema: DependenciesOutputSchema,
      schemaName: 'DependenciesRepair',
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    }),
  );
  if (result === null) return null;

  const oldByKey = new Map(inside.map((e) => [edgeKey(e), e]));
  const proposed = new Map<string, DependencyRow>();
  let discarded = 0;
  for (const e of outputToEdges(result.value, 'repair')) {
    if (e.from === e.to || !sameCycle(e)) {
      discarded += 1;
      continue;
    }
    const key = edgeKey(e);
    if (!proposed.has(key)) proposed.set(key, oldByKey.get(key) ?? e);
  }
  const outside = edges.filter((e) => !sameCycle(e));
  return {
    edges: [...outside, ...proposed.values()],
    removed: inside.filter((e) => !proposed.has(edgeKey(e))),
    discarded,
  };
}

export function repairedIssue(e: EdgeRef, how: 'automatic repair' | 'the user'): IssueDraft {
  return {
    stage: 5,
    severity: 'warning',
    kind: 'cycle_repaired',
    message: `Dependency ${e.from} -> ${e.to} was removed by ${how} to break a dependency cycle.`,
    refs: [e.from, e.to],
    resolution: `Removed by ${how}.`,
  };
}
