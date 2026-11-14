import { resolveConfig } from '@spm/shared';
import { schedulePlan } from '@spm/scheduler';
import type { PlanApi } from './client';
import { ApiRequestError } from './errors';
import { STAGE_NAMES, goldenRunStatus, listStaticGolden, loadGolden } from './golden';
import type {
  ConfigPatch,
  CreateProjectRequest,
  CreateProjectResponse,
  CycleInfo,
  DemoGoldenItem,
  Plan,
  ProjectListItem,
  RerunRequest,
  ResolveCycleRequest,
  RunCreatedResponse,
  RunStatus,
} from './types';
import { exportPlanLocally } from '../lib/exporters';

export { STAGE_NAMES };

/** Simulated stage durations in ms (a real run takes minutes; the demo takes about 12 s). */
const SIM_STAGE_MS = [1400, 1900, 2600, 1500, 2100, 700, 1800, 500];
/** Stage 3 shows a retry so the stepper's attempts column has something to say. */
const SIM_ATTEMPTS = [1, 1, 2, 1, 1, 1, 1, 1];

/**
 * Fixture mode only: an idea that contains one of these markers triggers a simulated situation, so
 * the cycle, failure and limit screens can be shown without a server.
 *   [demo:cycle]  the run stops at stage 5 with a dependency cycle to resolve
 *   [demo:fail]   stage 3 fails
 *   [demo:limit]  starting the run answers RATE_LIMITED
 */
export type SimMode = 'normal' | 'cycle' | 'fail';

export interface SimRun {
  runId: string;
  projectId: string;
  idea: string;
  startedAt: number;
  planId: string;
  mode?: SimMode;
  /** Edges of the simulated cycle (mode "cycle"). */
  cycle?: CycleInfo;
  /** When the user resolved the cycle (ms since the epoch). */
  resolvedAt?: number;
  /** A re-run: stages before this one are reused from the parent. */
  fromStage?: number;
  config?: ConfigPatch;
}

const SIM_KEY = 'spm.fixture.runs';

function loadSimRuns(): SimRun[] {
  try {
    const raw = sessionStorage.getItem(SIM_KEY);
    return raw ? (JSON.parse(raw) as SimRun[]) : [];
  } catch {
    return [];
  }
}

function saveSimRuns(runs: SimRun[]): void {
  try {
    sessionStorage.setItem(SIM_KEY, JSON.stringify(runs));
  } catch {
    /* storage blocked: the simulated run then only lives in memory */
  }
}

let memoryRuns: SimRun[] | null = null;
const simRuns = (): SimRun[] => (memoryRuns ??= loadSimRuns());
function addSimRun(run: SimRun): void {
  memoryRuns = [...simRuns(), run].slice(-20);
  saveSimRuns(memoryRuns);
}
function patchSimRun(runId: string, patch: Partial<SimRun>): void {
  memoryRuns = simRuns().map((r) => (r.runId === runId ? { ...r, ...patch } : r));
  saveSimRuns(memoryRuns);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function simulateRunStatus(sim: SimRun, now: number): RunStatus {
  const elapsed = now - sim.startedAt;
  const from = sim.fromStage ?? 1;
  const mode = sim.mode ?? 'normal';
  const stages: RunStatus['stages'] = [];
  let cursor = 0;
  let current = 0;
  let status: RunStatus['status'] = 'running';
  let cycle: CycleInfo | null = null;
  let error: RunStatus['error'] = null;
  let halted = false;

  STAGE_NAMES.forEach((name, i) => {
    const n = i + 1;
    if (halted) {
      stages.push({ stage: n, name, status: 'pending' });
      return;
    }
    if (n < from) {
      stages.push({ stage: n, name, status: 'cached', attempts: 0, latency_ms: 0 });
      return;
    }
    const duration = SIM_STAGE_MS[i] ?? 1000;
    const start = cursor;
    const end = start + duration;
    if (elapsed < start) {
      stages.push({ stage: n, name, status: 'pending' });
      return;
    }
    if (elapsed < end) {
      current = n;
      stages.push({ stage: n, name, status: 'running', attempts: 1 });
      cursor = end;
      halted = true;
      return;
    }
    if (mode === 'fail' && n === 3) {
      current = n;
      status = 'failed';
      error = {
        stage: 3,
        code: 'STAGE_FAILED',
        message: 'The model did not return valid tasks after 3 attempts.',
        details: {},
      };
      stages.push({ stage: n, name, status: 'failed', attempts: 3, latency_ms: duration });
      halted = true;
      return;
    }
    if (mode === 'cycle' && n === 5) {
      if (sim.resolvedAt === undefined || elapsed < sim.resolvedAt - sim.startedAt) {
        current = n;
        status = 'needs_resolution';
        cycle = sim.cycle ?? null;
        stages.push({ stage: n, name, status: 'running', attempts: 1 });
        halted = true;
        return;
      }
      // The pause lasted until the user resolved the cycle; stages 6-8 start after it.
      cursor = Math.max(end, sim.resolvedAt - sim.startedAt);
    } else {
      cursor = end;
    }
    stages.push({
      stage: n,
      name,
      status: 'succeeded',
      attempts: SIM_ATTEMPTS[i] ?? 1,
      latency_ms: duration,
    });
  });

  const done = !halted && stages.every((s) => s.status === 'succeeded' || s.status === 'cached');
  if (done) status = 'succeeded';
  return {
    run_id: sim.runId,
    status,
    current_stage: done ? 8 : current,
    stages,
    issues_count: { error: 0, warning: done ? 3 : 0 },
    cycle,
    error,
  };
}

/** The plan a finished simulated run shows: the base golden plan, re-scheduled for a re-run. */
function planForSim(base: Plan, sim: SimRun): Plan {
  const plan: Plan = { ...base, run: { ...base.run, id: sim.runId } };
  if (!sim.config) return plan;
  const checked = resolveConfig(sim.config, base.run.config);
  if (!checked.success) return plan;
  const result = schedulePlan(base, checked.data);
  if (!result.ok) return plan;
  return { ...plan, run: { ...plan.run, config: checked.data }, schedule: result.schedule };
}

function simCycle(base: Plan): CycleInfo | undefined {
  const [a, b, c] = base.tasks.slice(2, 5).map((t) => t.id);
  if (!a || !b || !c) return undefined;
  return {
    task_ids: [a, b, c],
    edges: [
      { from: a, to: b },
      { from: b, to: c },
      { from: c, to: a },
    ],
  };
}

const CONFIG_RULE_MESSAGE =
  'The configuration breaks a capacity rule (C >= 13 points, H >= hours of a 13-point task).';

/** Backend that serves /golden/*.json and simulates runs, so the UI works with no server. */
export function createFixtureApi(): PlanApi {
  async function findBase(runId: string): Promise<{ sim?: SimRun; plan: Plan }> {
    const plans = await loadGolden();
    const sim = simRuns().find((s) => s.runId === runId);
    if (sim) {
      const base = plans.find((p) => p.run.id === sim.planId);
      if (base) return { sim, plan: base };
    }
    const plan = plans.find((p) => p.run.id === runId);
    if (!plan) throw new ApiRequestError('NOT_FOUND', `Run ${runId} was not found.`, 404);
    return { plan };
  }

  return {
    mode: 'fixture',

    listGolden: (): Promise<DemoGoldenItem[]> => listStaticGolden(),

    listProjects(): Promise<ProjectListItem[]> {
      const latest = new Map<string, SimRun>();
      for (const s of simRuns()) latest.set(s.projectId, s);
      return Promise.resolve(
        [...latest.values()].reverse().map((s) => ({
          id: s.projectId,
          idea_text: s.idea,
          created_at: new Date(s.startedAt).toISOString(),
          latest_run: { id: s.runId, status: simulateRunStatus(s, Date.now()).status },
        })),
      );
    },

    async createProject(req: CreateProjectRequest): Promise<CreateProjectResponse> {
      await delay(250);
      if (req.idea_text.includes('[demo:limit]')) {
        throw new ApiRequestError(
          'RATE_LIMITED',
          'Too many runs from this address. Try again later.',
          429,
        );
      }
      if (!resolveConfig(req.config ?? {}).success) {
        throw new ApiRequestError('INVALID_CONFIG', CONFIG_RULE_MESSAGE, 400);
      }
      const plans = await loadGolden();
      const first = plans[0];
      if (!first) throw new ApiRequestError('NOT_FOUND', 'No golden plan is available.', 404);
      const mode: SimMode = req.idea_text.includes('[demo:cycle]')
        ? 'cycle'
        : req.idea_text.includes('[demo:fail]')
          ? 'fail'
          : 'normal';
      const cycle = mode === 'cycle' ? simCycle(first) : undefined;
      const sim: SimRun = {
        runId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        idea: req.idea_text,
        startedAt: Date.now(),
        planId: first.run.id,
        mode,
        ...(cycle ? { cycle } : {}),
      };
      addSimRun(sim);
      return { project_id: sim.projectId, run_id: sim.runId };
    },

    async getRun(runId: string): Promise<RunStatus> {
      const { sim, plan } = await findBase(runId);
      return sim ? simulateRunStatus(sim, Date.now()) : goldenRunStatus(plan);
    },

    async getPlan(runId: string): Promise<Plan> {
      const { sim, plan } = await findBase(runId);
      if (!sim) return plan;
      if (simulateRunStatus(sim, Date.now()).status !== 'succeeded') {
        throw new ApiRequestError('RUN_NOT_READY', 'The run has not finished yet.', 409);
      }
      return planForSim(plan, sim);
    },

    async rerun(runId: string, req: RerunRequest): Promise<RunCreatedResponse> {
      await delay(250);
      const { sim, plan } = await findBase(runId);
      const merged: ConfigPatch = { ...(sim?.config ?? {}), ...(req.config ?? {}) };
      if (!resolveConfig(merged, plan.run.config).success) {
        throw new ApiRequestError('INVALID_CONFIG', CONFIG_RULE_MESSAGE, 400);
      }
      const next: SimRun = {
        runId: crypto.randomUUID(),
        projectId: sim?.projectId ?? crypto.randomUUID(),
        idea: sim?.idea ?? plan.project.idea_text,
        startedAt: Date.now(),
        planId: plan.run.id,
        mode: 'normal',
        fromStage: req.from_stage,
        config: merged,
      };
      addSimRun(next);
      return { run_id: next.runId };
    },

    async resolveCycle(runId: string, req: ResolveCycleRequest): Promise<RunCreatedResponse> {
      await delay(200);
      const { sim } = await findBase(runId);
      if (!sim || simulateRunStatus(sim, Date.now()).status !== 'needs_resolution') {
        throw new ApiRequestError(
          'INVALID_STATE',
          'The run is not waiting for a cycle resolution.',
          409,
        );
      }
      const cycleEdges = sim.cycle?.edges ?? [];
      const known = new Set(cycleEdges.map((e) => `${e.from}->${e.to}`));
      if (req.remove_edges.some((e) => !known.has(`${e.from}->${e.to}`))) {
        throw new ApiRequestError(
          'VALIDATION_FAILED',
          'Some edges are not part of the reported cycle.',
          400,
        );
      }
      // The simulated cycle is a single loop: removing any one of its edges breaks it.
      patchSimRun(runId, { resolvedAt: Date.now() });
      return { run_id: runId };
    },

    exportPlan(plan, kind) {
      return Promise.resolve(exportPlanLocally(plan, kind));
    },
  };
}
