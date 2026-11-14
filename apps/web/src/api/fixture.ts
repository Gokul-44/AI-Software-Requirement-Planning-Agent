import { resolveConfig } from '@spm/shared';
import type { PlanApi } from './client';
import { ApiRequestError } from './errors';
import type {
  CreateProjectRequest,
  CreateProjectResponse,
  DemoGoldenItem,
  Plan,
  ProjectListItem,
  RunStatus,
} from './types';
import { exportPlanLocally } from '../lib/exporters';

export const STAGE_NAMES = [
  'requirements',
  'stories',
  'tasks',
  'estimates',
  'dependencies',
  'schedule',
  'risks',
  'assemble',
] as const;

/** Simulated stage durations in ms (a real run takes minutes; the demo takes about 12 s). */
const SIM_STAGE_MS = [1400, 1900, 2600, 1500, 2100, 700, 1800, 500];
/** Stage 3 shows a retry so the stepper's attempts column has something to say. */
const SIM_ATTEMPTS = [1, 1, 2, 1, 1, 1, 1, 1];

export interface SimRun {
  runId: string;
  projectId: string;
  idea: string;
  startedAt: number;
  planId: string;
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

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Loads every plan listed in /golden/index.json (cached for the session). */
let goldenPromise: Promise<Plan[]> | null = null;
function loadGolden(): Promise<Plan[]> {
  const promise = (async () => {
    const indexRes = await fetch('/golden/index.json');
    if (!indexRes.ok) {
      throw new ApiRequestError(
        'NOT_FOUND',
        'The golden demo list (/golden/index.json) is missing.',
        404,
      );
    }
    const files = (await indexRes.json()) as string[];
    return Promise.all(
      files.map(async (file) => {
        const res = await fetch(`/golden/${file}`);
        if (!res.ok) {
          throw new ApiRequestError(
            'NOT_FOUND',
            `Golden plan ${file} could not be loaded.`,
            res.status,
          );
        }
        return (await res.json()) as Plan;
      }),
    );
  })();
  goldenPromise = promise;
  promise.catch(() => {
    if (goldenPromise === promise) goldenPromise = null; // allow a retry after a failure
  });
  return promise;
}

export function simulateRunStatus(sim: SimRun, now: number): RunStatus {
  const elapsed = now - sim.startedAt;
  let cursor = 0;
  let current = 0;
  const stages: RunStatus['stages'] = STAGE_NAMES.map((name, i) => {
    const duration = SIM_STAGE_MS[i] ?? 1000;
    const start = cursor;
    cursor += duration;
    if (elapsed >= cursor) {
      return {
        stage: i + 1,
        name,
        status: 'succeeded' as const,
        attempts: SIM_ATTEMPTS[i] ?? 1,
        latency_ms: duration,
      };
    }
    if (elapsed >= start) {
      current = i + 1;
      return { stage: i + 1, name, status: 'running' as const, attempts: 1 };
    }
    return { stage: i + 1, name, status: 'pending' as const };
  });
  const done = elapsed >= cursor;
  return {
    run_id: sim.runId,
    status: done ? 'succeeded' : 'running',
    current_stage: done ? 8 : current,
    stages,
    issues_count: { error: 0, warning: done ? 3 : 0 },
    cycle: null,
    error: null,
  };
}

function goldenRunStatus(plan: Plan): RunStatus {
  return {
    run_id: plan.run.id,
    status: plan.run.status,
    current_stage: 8,
    stages: STAGE_NAMES.map((name, i) => ({
      stage: i + 1,
      name,
      status: 'cached' as const,
      attempts: 0,
      latency_ms: 0,
    })),
    issues_count: {
      error: plan.issues.filter((x) => x.severity === 'error').length,
      warning: plan.issues.filter((x) => x.severity === 'warning').length,
    },
    cycle: null,
    error: null,
  };
}

/** Backend that serves /golden/*.json and simulates runs, so the UI works with no server. */
export function createFixtureApi(): PlanApi {
  return {
    mode: 'fixture',

    async listGolden(): Promise<DemoGoldenItem[]> {
      const plans = await loadGolden();
      return plans.map((p) => ({ run_id: p.run.id, idea_text: p.project.idea_text }));
    },

    async listProjects(): Promise<ProjectListItem[]> {
      return simRuns()
        .slice()
        .reverse()
        .map((s) => ({
          id: s.projectId,
          idea_text: s.idea,
          created_at: new Date(s.startedAt).toISOString(),
          latest_run: { id: s.runId, status: simulateRunStatus(s, Date.now()).status },
        }));
    },

    async createProject(req: CreateProjectRequest): Promise<CreateProjectResponse> {
      await delay(250);
      const checked = resolveConfig(req.config ?? {});
      if (!checked.success) {
        throw new ApiRequestError(
          'INVALID_CONFIG',
          'The configuration breaks a capacity rule (C >= 13 points, H >= hours of a 13-point task).',
          400,
        );
      }
      const plans = await loadGolden();
      const first = plans[0];
      if (!first) throw new ApiRequestError('NOT_FOUND', 'No golden plan is available.', 404);
      const sim: SimRun = {
        runId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        idea: req.idea_text,
        startedAt: Date.now(),
        planId: first.run.id,
      };
      memoryRuns = [...simRuns(), sim].slice(-20);
      saveSimRuns(memoryRuns);
      return { project_id: sim.projectId, run_id: sim.runId };
    },

    async getRun(runId: string): Promise<RunStatus> {
      const sim = simRuns().find((s) => s.runId === runId);
      if (sim) return simulateRunStatus(sim, Date.now());
      const plan = (await loadGolden()).find((p) => p.run.id === runId);
      if (plan) return goldenRunStatus(plan);
      throw new ApiRequestError('NOT_FOUND', `Run ${runId} was not found.`, 404);
    },

    async getPlan(runId: string): Promise<Plan> {
      const plans = await loadGolden();
      const sim = simRuns().find((s) => s.runId === runId);
      if (sim) {
        if (simulateRunStatus(sim, Date.now()).status !== 'succeeded') {
          throw new ApiRequestError('RUN_NOT_READY', 'The run has not finished yet.', 409);
        }
        const base = plans.find((p) => p.run.id === sim.planId);
        if (base) return { ...base, run: { ...base.run, id: sim.runId } };
      }
      const plan = plans.find((p) => p.run.id === runId);
      if (!plan) throw new ApiRequestError('NOT_FOUND', `Run ${runId} was not found.`, 404);
      return plan;
    },

    async exportPlan(plan, kind) {
      return exportPlanLocally(plan, kind);
    },
  };
}
