import { ApiRequestError } from './errors';
import type { ExportKind, ExportFile } from './types';
import type { PlanApi } from './client';
import type {
  CreateProjectRequest,
  CreateProjectResponse,
  DemoGoldenItem,
  Plan,
  ProjectListItem,
  RunStatus,
} from './types';
import { exportPlanLocally } from '../lib/exporters';

/** Backend that talks to the real API (MASTER_PLAN C3). */
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

  const json = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
    mode: 'api',
    listGolden: () => request<DemoGoldenItem[]>('/demo/golden'),
    listProjects: () => request<ProjectListItem[]>('/projects?limit=20'),
    createProject: (req: CreateProjectRequest) =>
      request<CreateProjectResponse>('/projects', json(req)),
    getRun: (runId: string) => request<RunStatus>(`/runs/${encodeURIComponent(runId)}`),
    getPlan: (runId: string) => request<Plan>(`/runs/${encodeURIComponent(runId)}/plan`),
    async exportPlan(plan: Plan, kind: ExportKind): Promise<ExportFile> {
      if (kind === 'json') return exportPlanLocally(plan, kind);
      const path = kind === 'jira' ? 'jira.csv' : 'plan.md';
      const content = await request<string>(
        `/runs/${encodeURIComponent(plan.run.id)}/export/${path}`,
        undefined,
        'text',
      );
      const local = exportPlanLocally(plan, kind);
      return { ...local, content };
    },
  };
}
