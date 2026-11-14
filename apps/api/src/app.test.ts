import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { pino } from 'pino';
import { ApiErrorSchema, RunStatusSchema } from '@spm/shared';
import type { RunStatus } from '@spm/shared';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { MemoryRepository } from './db/memory-repository.js';
import { createHarness } from './llm/harness.js';
import { MockLlmClient } from './llm/mock.js';
import { Pipeline } from './pipeline/orchestrator.js';

const FOOD = 'I want an online food delivery app';

function setup(env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    LLM_PROVIDER: 'mock',
    LOG_LEVEL: 'silent',
    ...env,
  });
  const logger = pino({ level: 'silent' });
  const repo = new MemoryRepository();
  const llm = new MockLlmClient();
  const pipeline = new Pipeline({
    repo,
    harness: createHarness({ llm, cache: repo.cache }),
    logger,
  });
  const app = createApp({ config, repo, llm, pipeline, logger });
  return { app, repo, pipeline };
}

async function expectError(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = ApiErrorSchema.parse(res.body);
  expect(body.error.code).toBe(code);
  expect(body.error.request_id).toBe(res.headers['x-request-id']);
}

describe('POST /api/projects to a completed stage 3', () => {
  it('returns 202, then RunStatus reports stages 1-3 and the data is persisted', async () => {
    const { app, repo, pipeline } = setup();
    const created = await request(app).post('/api/projects').send({ idea_text: FOOD });
    expect(created.status).toBe(202);
    expect(created.headers['x-request-id']).toBeTruthy();
    const { run_id, project_id } = created.body as { run_id: string; project_id: string };

    await pipeline.idle();
    const res = await request(app).get(`/api/runs/${run_id}`);
    expect(res.status).toBe(200);
    const status: RunStatus = RunStatusSchema.parse(res.body);
    expect(status.run_id).toBe(run_id);
    expect(status.status).toBe('succeeded');
    expect(status.current_stage).toBe(3);
    expect(status.error).toBeNull();
    expect(status.cycle).toBeNull();
    expect(status.stages).toHaveLength(8);
    expect(status.stages.slice(0, 3).map((s) => [s.name, s.status])).toEqual([
      ['requirements', 'succeeded'],
      ['stories', 'succeeded'],
      ['tasks', 'succeeded'],
    ]);
    expect(status.stages.slice(3).every((s) => s.status === 'pending')).toBe(true);
    expect(status.stages[2]?.attempts).toBeGreaterThanOrEqual(2);
    expect(status.issues_count).toEqual({ error: 0, warning: 0 });

    const core = await repo.loadCore(run_id);
    expect(core.requirements.length).toBeGreaterThanOrEqual(5);
    expect(core.epics.length).toBeGreaterThanOrEqual(2);
    expect(core.stories.length).toBeGreaterThan(core.epics.length);
    expect(core.tasks.length).toBeGreaterThan(core.stories.length);
    expect(core.tasks[0]?.code).toBe('T-001');

    const run = await repo.getRun(run_id);
    expect(run?.llmProvider).toBe('mock');
    expect(run?.promptVersions).toEqual({ '1': 'v1', '2': 'v1', '3': 'v1' });
    expect(run?.inputTokens).toBeGreaterThan(0);

    const list = await request(app).get('/api/projects?limit=5');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        id: project_id,
        idea_text: FOOD,
        latest_run: { id: run_id, status: 'succeeded' },
      }),
    ]);
  });

  it('reports a running status while the pipeline works', async () => {
    const { app, pipeline } = setup();
    const created = await request(app).post('/api/projects').send({ idea_text: FOOD });
    const { run_id } = created.body as { run_id: string };
    const early = await request(app).get(`/api/runs/${run_id}`);
    expect(['queued', 'running', 'succeeded']).toContain(RunStatusSchema.parse(early.body).status);
    await pipeline.idle();
  });
});

describe('validation and errors use the C3 envelope', () => {
  it('rejects a short idea, unknown fields and bad JSON with VALIDATION_FAILED', async () => {
    const { app } = setup();
    await expectError(
      await request(app).post('/api/projects').send({ idea_text: 'short' }),
      400,
      'VALIDATION_FAILED',
    );
    await expectError(
      await request(app).post('/api/projects').send({ idea_text: FOOD, extra: 1 }),
      400,
      'VALIDATION_FAILED',
    );
    await expectError(
      await request(app)
        .post('/api/projects')
        .set('Content-Type', 'application/json')
        .send('{"idea_text":'),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('rejects a body over 50 kb', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/api/projects')
      .send({ idea_text: FOOD, pad: 'x'.repeat(60_000) });
    await expectError(res, 400, 'VALIDATION_FAILED');
  });

  it('rejects a config that breaks the capacity invariants with INVALID_CONFIG', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/api/projects')
      .send({ idea_text: FOOD, config: { team_size: 1, velocity_points_per_person: 5 } });
    await expectError(res, 400, 'INVALID_CONFIG');
    const hours = await request(app)
      .post('/api/projects')
      .send({ idea_text: FOOD, config: { sprint_length_days: 2, focus_hours_per_day: 4 } });
    await expectError(hours, 400, 'INVALID_CONFIG');
  });

  it('returns NOT_FOUND for an unknown run, a malformed id and an unknown route', async () => {
    const { app } = setup();
    await expectError(
      await request(app).get('/api/runs/00000000-0000-4000-8000-000000000000'),
      404,
      'NOT_FOUND',
    );
    await expectError(await request(app).get('/api/runs/not-a-uuid'), 404, 'NOT_FOUND');
    await expectError(await request(app).get('/api/nothing'), 404, 'NOT_FOUND');
  });

  it('echoes a valid X-Request-Id and generates one otherwise', async () => {
    const { app } = setup();
    const given = await request(app).get('/api/health').set('X-Request-Id', 'abc-12345678');
    expect(given.headers['x-request-id']).toBe('abc-12345678');
    const bad = await request(app).get('/api/health').set('X-Request-Id', 'bad id!');
    expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets security headers and honours CORS_ORIGIN', async () => {
    const { app } = setup({ CORS_ORIGIN: 'http://localhost:5173' });
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const other = await request(app).get('/api/health').set('Origin', 'http://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('limits for live runs', () => {
  it('limits concurrent runs', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      LLM_PROVIDER: 'mock',
      LOG_LEVEL: 'silent',
      MAX_CONCURRENT_RUNS: '1',
    });
    const logger = pino({ level: 'silent' });
    const repo = new MemoryRepository();
    // A provider that waits, so the first run is still in progress when the second arrives.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const inner = new MockLlmClient();
    const llm = {
      provider: 'mock',
      model: 'mock-1',
      generateStructured: async (req: Parameters<MockLlmClient['generateStructured']>[0]) => {
        await gate;
        return inner.generateStructured(req);
      },
    } as MockLlmClient;
    const pipeline = new Pipeline({
      repo,
      harness: createHarness({ llm, cache: repo.cache }),
      logger,
    });
    const app = createApp({ config, repo, llm, pipeline, logger });

    expect((await request(app).post('/api/projects').send({ idea_text: FOOD })).status).toBe(202);
    expect(pipeline.activeRuns).toBe(1);
    await expectError(
      await request(app).post('/api/projects').send({ idea_text: 'A habit tracker for runners' }),
      429,
      'TOO_MANY_RUNS',
    );
    release();
    await pipeline.idle();
    expect(pipeline.activeRuns).toBe(0);
  });
});

describe('GET /api/health', () => {
  it('reports db, llm and version', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      db: 'ok',
      llm_configured: true,
      budget: { spent_today_usd: 0 },
    });
  });

  it('says the model is not configured when gemini has no key', async () => {
    const { app } = setup({ LLM_PROVIDER: 'gemini' });
    const res = await request(app).get('/api/health');
    expect((res.body as { llm_configured: boolean }).llm_configured).toBe(false);
  });
});

describe('startup recovery', () => {
  it('marks a run left queued or running as failed with reason INTERRUPTED', async () => {
    const { app, repo, pipeline } = setup();
    const { runId } = await repo.createProjectWithRun({
      ideaText: FOOD,
      config: (await import('@spm/shared')).DEFAULT_CONFIG,
      llmProvider: 'mock',
      llmModel: 'mock-1',
      promptVersions: {},
    });
    await repo.updateRun(runId, { status: 'running', currentStage: 2 });
    await repo.updateStage(runId, 2, { status: 'running' });

    expect(await pipeline.recover()).toEqual([runId]);
    const res = await request(app).get(`/api/runs/${runId}`);
    const status = RunStatusSchema.parse(res.body);
    expect(status.status).toBe('failed');
    expect(status.error).toMatchObject({
      stage: 2,
      code: 'STAGE_FAILED',
      details: { reason: 'INTERRUPTED' },
    });
    expect(status.stages[1]?.status).toBe('failed');
    expect(await pipeline.recover()).toEqual([]);
  });
});
