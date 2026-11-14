import { ApiRequestError } from './errors';
import type { PlanApi } from './client';
import { goldenRunStatus, listStaticGolden, loadGolden } from './golden';
import type {
  CreateProjectRequest,
  CreateProjectResponse,
  DemoGoldenItem,
  ExportFile,
  ExportKind,
  Plan,
  ProjectListItem,
  RerunRequest,
  ResolveCycleRequest,
  RunCreatedResponse,
  RunStatus,
} from './types';
import { exportPlanLocally } from '../lib/exporters';

/**
 * Backend that talks to the real API (design document C3). The recorded golden plans that ship with
 * the web app are a fallback: the demo list also shows them, and opening one never needs the server.
 */
export function createHttpApi(baseUrl: string): PlanApi {
  const base = baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, init?: RequestInit, as: 'json' | 'text' = 'json') {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
      });
    } catch {
      throw new ApiRequestError(
        'NETWORK',
        `Cannot reach the API at ${base}. Check that the server is running.`,
        0,
      );
    }
    if (!res.ok) {
      const requestId = res.headers.get('X-Request-Id');
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        /* not JSON */
      }
      const err = (body as { error?: Record<string, unknown> } | null)?.error;
      throw new ApiRequestError(
        typeof err?.code === 'string' ? err.code : 'HTTP_ERROR',
        typeof err?.message === 'string'
          ? err.message
          : `Request failed with status ${res.status}.`,
        res.status,
        typeof err?.request_id === 'string' ? err.request_id : requestId,
        (err?.details as Record<string, unknown> | undefined) ?? {},
      );
    }
    return (as === 'text' ? await res.text() : await res.json()) as T;
  }

  const post = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  /** The bundled golden plan for a run id, or null (also null when the plans cannot be loaded). */
  async function staticPlan(runId: string): Promise<Plan | null> {
    try {
      return (await loadGolden()).find((p) => p.run.id === runId) ?? null;
    } catch {
      return null;
    }
  }

  return {
    mode: 'api',

    async listGolden(): Promise<DemoGoldenItem[]> {
      const [served, bundled] = await Promise.allSettled([
        request<DemoGoldenItem[]>('/demo/golden'),
        listStaticGolden(),
      ]);
      const out = new Map<string, DemoGoldenItem>();
      for (const result of [served, bundled]) {
        if (result.status === 'fulfilled') {
          for (const item of result.value) if (!out.has(item.run_id)) out.set(item.run_id, item);
        }
      }
      if (out.size === 0 && served.status === 'rejected') throw served.reason;
      return [...out.values()];
    },

    listProjects: () => request<ProjectListItem[]>('/projects?limit=20'),

    createProject: (req: CreateProjectRequest) =>
      request<CreateProjectResponse>('/projects', post(req)),

    async getRun(runId: string): Promise<RunStatus> {
      const bundled = await staticPlan(runId);
      if (bundled) return goldenRunStatus(bundled);
      return request<RunStatus>(`/runs/${encodeURIComponent(runId)}`);
    },

    async getPlan(runId: string): Promise<Plan> {
      const bundled = await staticPlan(runId);
      if (bundled) return bundled;
      return request<Plan>(`/runs/${encodeURIComponent(runId)}/plan`);
    },

    rerun: (runId: string, req: RerunRequest) =>
      request<RunCreatedResponse>(`/runs/${encodeURIComponent(runId)}/rerun`, post(req)),

    resolveCycle: (runId: string, req: ResolveCycleRequest) =>
      request<RunCreatedResponse>(`/runs/${encodeURIComponent(runId)}/resolve-cycle`, post(req)),

    async exportPlan(plan: Plan, kind: ExportKind): Promise<ExportFile> {
      // JSON is the plan itself; a bundled golden plan has no server-side run to export from.
      if (kind === 'json' || (await staticPlan(plan.run.id))) {
        return exportPlanLocally(plan, kind);
      }
      const path = kind === 'jira' ? 'jira.csv' : 'plan.md';
      const content = await request<string>(
        `/runs/${encodeURIComponent(plan.run.id)}/export/${path}`,
        undefined,
        'text',
      );
      return { ...exportPlanLocally(plan, kind), content };
    },
  };
}
