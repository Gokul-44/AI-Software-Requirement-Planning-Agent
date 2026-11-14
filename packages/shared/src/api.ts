import { z } from 'zod';
import { ConfigPatchSchema } from './config.js';
import { RunStatusValue } from './plan.js';
import { TaskId } from './ids.js';

/** API DTOs and error model (MASTER_PLAN C3). */

// ------------------------------------------------------------ Error model
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'INVALID_CONFIG',
  'ACCESS_CODE_REQUIRED',
  'NOT_FOUND',
  'RUN_NOT_READY',
  'INVALID_STATE',
  'RATE_LIMITED',
  'BUDGET_EXHAUSTED',
  'TOO_MANY_RUNS',
  'LLM_UNAVAILABLE',
  'INTERNAL',
] as const;
export const ApiErrorCode = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const API_ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 400,
  INVALID_CONFIG: 400,
  ACCESS_CODE_REQUIRED: 401,
  NOT_FOUND: 404,
  RUN_NOT_READY: 409,
  INVALID_STATE: 409,
  RATE_LIMITED: 429,
  BUDGET_EXHAUSTED: 429,
  TOO_MANY_RUNS: 429,
  LLM_UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** Every non-2xx response body. Stage failures are NOT HTTP errors (see RunStatus.error). */
export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: ApiErrorCode,
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
    request_id: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export function makeApiError(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  details: Record<string, unknown> = {},
): ApiError {
  return { error: { code, message, details, request_id: requestId } };
}

// ------------------------------------------------------------ RunStatus
export const StageStatus = z.enum(['pending', 'running', 'succeeded', 'cached', 'failed']);
export type StageStatus = z.infer<typeof StageStatus>;

export const StageStatusEntrySchema = z.strictObject({
  stage: z.number().int().min(1).max(8),
  name: z.string(),
  status: StageStatus,
  attempts: z.number().int().min(0).optional(),
  latency_ms: z.number().int().min(0).optional(),
});

/** Set while a run waits in `needs_resolution`: the SCC(s) to break. */
export const CycleInfoSchema = z.strictObject({
  task_ids: z.array(TaskId),
  edges: z.array(z.strictObject({ from: TaskId, to: TaskId })),
});
export type CycleInfo = z.infer<typeof CycleInfoSchema>;

export const StageErrorSchema = z.strictObject({
  stage: z.number().int().min(1).max(8),
  code: z.literal('STAGE_FAILED'),
  message: z.string(),
  details: z.record(z.string(), z.unknown()),
});
export type StageError = z.infer<typeof StageErrorSchema>;

export const RunStatusSchema = z.strictObject({
  run_id: z.uuid(),
  status: RunStatusValue,
  current_stage: z.number().int().min(0).max(8),
  stages: z.array(StageStatusEntrySchema),
  issues_count: z.strictObject({
    error: z.number().int().min(0),
    warning: z.number().int().min(0),
  }),
  cycle: CycleInfoSchema.nullable(),
  error: StageErrorSchema.nullable(),
});
export type RunStatus = z.infer<typeof RunStatusSchema>;

// ------------------------------------------------------------ Requests and responses
/** Input length is open question 5; 2000 characters is the proposed upper bound. */
export const IDEA_TEXT_MAX = 2000;

export const CreateProjectRequestSchema = z.strictObject({
  idea_text: z.string().trim().min(10).max(IDEA_TEXT_MAX),
  /** Partial overrides; the server applies defaults and the C/H invariants (INVALID_CONFIG). */
  config: ConfigPatchSchema.optional(),
  access_code: z.string().optional(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const CreateProjectResponseSchema = z.strictObject({
  project_id: z.uuid(),
  run_id: z.uuid(),
});
export type CreateProjectResponse = z.infer<typeof CreateProjectResponseSchema>;

export const ProjectListItemSchema = z.strictObject({
  id: z.uuid(),
  idea_text: z.string(),
  created_at: z.iso.datetime({ offset: true }),
  latest_run: z.strictObject({ id: z.uuid(), status: RunStatusValue }).nullable(),
});
export type ProjectListItem = z.infer<typeof ProjectListItemSchema>;
export const ProjectListResponseSchema = z.array(ProjectListItemSchema);

export const RerunRequestSchema = z.strictObject({
  from_stage: z.number().int().min(1).max(8),
  config: ConfigPatchSchema.optional(),
  /** Needed when the server runs with DEMO_ACCESS_CODE, as for a new project. */
  access_code: z.string().optional(),
  /**
   * Retry after a failure: stage `from_stage` and later ones read the cache, so model calls that
   * already succeeded (for example the first epics of stage 3) are not paid for again. Without it
   * a re-run asks the model again from `from_stage` on.
   */
  reuse_cache: z.boolean().optional(),
});
export type RerunRequest = z.infer<typeof RerunRequestSchema>;

export const ResolveCycleRequestSchema = z.strictObject({
  remove_edges: z.array(z.strictObject({ from: TaskId, to: TaskId })).min(1),
});
export type ResolveCycleRequest = z.infer<typeof ResolveCycleRequestSchema>;

export const RunCreatedResponseSchema = z.strictObject({ run_id: z.uuid() });
export type RunCreatedResponse = z.infer<typeof RunCreatedResponseSchema>;

export const DemoGoldenItemSchema = z.strictObject({
  run_id: z.uuid(),
  idea_text: z.string(),
});
export type DemoGoldenItem = z.infer<typeof DemoGoldenItemSchema>;
export const DemoGoldenResponseSchema = z.array(DemoGoldenItemSchema);

export const HealthResponseSchema = z.strictObject({
  status: z.string(),
  db: z.string(),
  llm_configured: z.boolean(),
  budget: z.strictObject({
    spent_today_usd: z.number().min(0),
    cap_usd: z.number().min(0),
  }),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
