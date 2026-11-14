import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pino } from 'pino';
import { RunStatusSchema } from '@spm/shared';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createHarness } from '../llm/harness.js';
import { MockLlmClient } from '../llm/mock.js';
import { Pipeline } from '../pipeline/orchestrator.js';
import { PgRepository, createPool, normaliseSsl } from './pg-repository.js';

describe('normaliseSsl', () => {
  it('spells out full verification for the sslmodes pg already treats that way', () => {
    expect(normaliseSsl('postgres://h/db?sslmode=require')).toBe(
      'postgres://h/db?sslmode=verify-full',
    );
    expect(normaliseSsl('postgres://h/db?a=1&sslmode=prefer&b=2')).toBe(
      'postgres://h/db?a=1&sslmode=verify-full&b=2',
    );
    expect(normaliseSsl('postgres://h/db')).toBe('postgres://h/db');
  });
});

/**
 * Database-backed test. It is skipped unless SPM_DB_TESTS=1 and DATABASE_URL are set, so `npm test`
 * and CI never touch a database. It needs migration 001 applied. It creates its own project and
 * run, and removes only those rows afterwards (plus the stage_cache rows written by the mock).
 */
const enabled = process.env['SPM_DB_TESTS'] === '1' && Boolean(process.env['DATABASE_URL']);

describe.skipIf(!enabled)('PgRepository with the mock provider (own rows only)', () => {
  const connectionString = process.env['DATABASE_URL'] ?? '';
  const pool = createPool({ connectionString, max: 3 });
  const created: string[] = [];

  afterAll(async () => {
    if (created.length > 0) {
      // Deleting the project cascades to its runs and every plan row of those runs.
      await pool.query('DELETE FROM projects WHERE id = ANY($1::uuid[])', [created]);
    }
    await pool.query(`DELETE FROM stage_cache WHERE llm_model = 'mock-1'`);
    await pool.end();
  });

  it('runs stages 1-3 end to end and persists every table', async () => {
    const config = loadConfig({ NODE_ENV: 'test', LLM_PROVIDER: 'mock', LOG_LEVEL: 'silent' });
    const logger = pino({ level: 'silent' });
    const repo = new PgRepository(pool);
    const llm = new MockLlmClient();
    const pipeline = new Pipeline({
      repo,
      harness: createHarness({ llm, cache: repo.cache }),
      logger,
    });
    const app = createApp({ config, repo, llm, pipeline, logger });

    const res = await request(app)
      .post('/api/projects')
      .send({ idea_text: 'I want an online food delivery app (database test)' });
    expect(res.status).toBe(202);
    const { run_id, project_id } = res.body as { run_id: string; project_id: string };
    created.push(project_id);
    await pipeline.idle();

    const status = RunStatusSchema.parse((await request(app).get(`/api/runs/${run_id}`)).body);
    expect(status.status).toBe('succeeded');
    expect(status.stages.slice(0, 3).every((s) => s.status === 'succeeded')).toBe(true);

    const core = await repo.loadCore(run_id);
    expect(core.requirements.length).toBeGreaterThanOrEqual(5);
    expect(core.stories.every((s) => s.requirementCodes.length >= 1)).toBe(true);
    expect(core.tasks.length).toBeGreaterThan(core.stories.length);

    const list = await request(app).get('/api/projects?limit=3');
    expect(list.status).toBe(200);
    expect(await repo.countRunsSince(new Date(Date.now() - 3_600_000))).toBeGreaterThanOrEqual(1);
  }, 90_000);

  it('recovers only runs that are queued or running', async () => {
    const repo = new PgRepository(pool);
    const { projectId, runId } = await repo.createProjectWithRun({
      ideaText: 'An interrupted run for the recovery test',
      config: (await import('@spm/shared')).DEFAULT_CONFIG,
      llmProvider: 'mock',
      llmModel: 'mock-1',
      promptVersions: {},
    });
    created.push(projectId);
    await repo.updateRun(runId, { status: 'running', currentStage: 2 });
    await repo.updateStage(runId, 2, { status: 'running' });
    const ids = await repo.markInterruptedRuns();
    expect(ids).toContain(runId);
    const run = await repo.getRun(runId);
    expect(run?.status).toBe('failed');
    expect(run?.error?.details['reason']).toBe('INTERRUPTED');
  }, 30_000);
});
