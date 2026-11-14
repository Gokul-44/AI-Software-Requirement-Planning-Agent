import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
  ApiErrorSchema,
  CreateProjectRequestSchema,
  RunStatusSchema,
  makeApiError,
} from '../src/index.js';

describe('API contracts', () => {
  it('maps every error code to the C3 HTTP status', () => {
    expect(Object.keys(API_ERROR_HTTP_STATUS).sort()).toEqual([...API_ERROR_CODES].sort());
    expect(API_ERROR_HTTP_STATUS.INVALID_CONFIG).toBe(400);
    expect(API_ERROR_HTTP_STATUS.ACCESS_CODE_REQUIRED).toBe(401);
    expect(API_ERROR_HTTP_STATUS.RUN_NOT_READY).toBe(409);
    expect(API_ERROR_HTTP_STATUS.BUDGET_EXHAUSTED).toBe(429);
    expect(API_ERROR_HTTP_STATUS.LLM_UNAVAILABLE).toBe(503);
    expect(API_ERROR_HTTP_STATUS.INTERNAL).toBe(500);
  });

  it('builds and validates the error envelope', () => {
    const e = makeApiError('BUDGET_EXHAUSTED', 'Daily live-run budget reached.', 'req-1');
    expect(ApiErrorSchema.safeParse(e).success).toBe(true);
    const bad = { error: { ...e.error, code: 'TEAPOT' } };
    expect(ApiErrorSchema.safeParse(bad).success).toBe(false);
  });

  it('validates the C3 RunStatus example', () => {
    const status = {
      run_id: '22222222-2222-4222-8222-222222222222',
      status: 'running',
      current_stage: 3,
      stages: [
        { stage: 1, name: 'requirements', status: 'cached', attempts: 0, latency_ms: 0 },
        { stage: 2, name: 'stories', status: 'succeeded', attempts: 1, latency_ms: 18400 },
        { stage: 3, name: 'tasks', status: 'running' },
      ],
      issues_count: { error: 0, warning: 2 },
      cycle: null,
      error: null,
    };
    expect(RunStatusSchema.safeParse(status).success).toBe(true);
    expect(RunStatusSchema.safeParse({ ...status, status: 'paused' }).success).toBe(false);
  });

  it('validates CreateProject requests', () => {
    expect(CreateProjectRequestSchema.safeParse({ idea_text: 'A todo app' }).success).toBe(true);
    expect(CreateProjectRequestSchema.safeParse({ idea_text: '' }).success).toBe(false);
    expect(CreateProjectRequestSchema.safeParse({ idea_text: 'x'.repeat(2001) }).success).toBe(
      false,
    );
    expect(
      CreateProjectRequestSchema.safeParse({ idea_text: 'A todo app', config: { team_size: 0 } })
        .success,
    ).toBe(false);
  });
});
