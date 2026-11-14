import { createFixtureApi } from './fixture';
import { createHttpApi } from './http';
import type {
  CreateProjectRequest,
  CreateProjectResponse,
  DemoGoldenItem,
  ExportFile,
  ExportKind,
  Plan,
  ProjectListItem,
  RunStatus,
} from './types';

/** Everything the UI needs from a backend. Two implementations: fixture and HTTP. */
export interface PlanApi {
  mode: 'fixture' | 'api';
  listGolden(): Promise<DemoGoldenItem[]>;
  listProjects(): Promise<ProjectListItem[]>;
  createProject(req: CreateProjectRequest): Promise<CreateProjectResponse>;
  getRun(runId: string): Promise<RunStatus>;
  getPlan(runId: string): Promise<Plan>;
  exportPlan(plan: Plan, kind: ExportKind): Promise<ExportFile>;
}

const env = import.meta.env;
const apiBase = (env.VITE_API_BASE_URL ?? '').trim();

/**
 * VITE_USE_FIXTURE=true loads /golden/*.json and simulates runs in the browser.
 * Otherwise the UI calls VITE_API_BASE_URL. With neither set, the fixture is the safe default.
 */
export const USE_FIXTURE = env.VITE_USE_FIXTURE === 'true' || apiBase === '';

export const api: PlanApi = USE_FIXTURE ? createFixtureApi() : createHttpApi(apiBase);
