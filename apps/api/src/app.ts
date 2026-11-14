import { randomUUID, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import type { Express, Request } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { toJiraCsv, toMarkdown } from '@spm/exporters';
import {
  CreateProjectRequestSchema,
  PlanSchema,
  RerunRequestSchema,
  ResolveCycleRequestSchema,
  resolveConfig,
} from '@spm/shared';
import type { HealthResponse, Plan, ProjectListItem } from '@spm/shared';
import { llmConfigured } from './config.js';
import type { AppConfig } from './config.js';
import type { Repository, RunRow } from './db/repository.js';
import { AppError, errorHandler, notFoundHandler, zodDetails } from './http/errors.js';
import { HourlyLimiter } from './http/limits.js';
import { buildRunStatus } from './http/run-status.js';
import type { LlmClient } from './llm/types.js';
import { PROMPT_VERSIONS } from './prompts/index.js';
import type { Pipeline } from './pipeline/orchestrator.js';

export interface AppDeps {
  config: AppConfig;
  repo: Repository;
  llm: LlmClient;
  pipeline: Pipeline;
  logger: Logger;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

function sameSecret(given: string | undefined, expected: string): boolean {
  if (given === undefined) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function createApp(deps: AppDeps): Express {
  const { config, repo, llm, pipeline, logger } = deps;
  const app = express();
  app.disable('x-powered-by');
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1);

  // Request id first, so every log line and every error response carries it.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const given = req.headers['x-request-id'];
        const id = typeof given === 'string' && REQUEST_ID.test(given) ? given : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      // Bodies hold the idea text and the access code: never logged. Headers are trimmed.
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  const origins = (config.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.use(cors({ origin: origins, exposedHeaders: ['X-Request-Id'], maxAge: 600 }));
  }
  app.use(express.json({ limit: '50kb' }));

  const limiter = new HourlyLimiter(config.RATE_LIMIT_RUNS_PER_HOUR);
  // The protections (F4, adapted for the free Gemini quota) apply to runs that call the real model.
  const live = config.LLM_PROVIDER === 'gemini';

  /**
   * F4: access code (401), per-IP rate limit, daily run cap counted from the runs table (it
   * protects the free quota) and the concurrency limit (all 429). The cap and the limit also
   * apply to re-runs, since they call the model again.
   */
  async function guardNewRun(req: Request, accessCode: string | undefined): Promise<void> {
    if (live) {
      if (config.DEMO_ACCESS_CODE && !sameSecret(accessCode, config.DEMO_ACCESS_CODE)) {
        throw new AppError(
          'ACCESS_CODE_REQUIRED',
          'A valid access code is required to start a live run.',
        );
      }
      if (!limiter.take(req.ip ?? 'unknown')) {
        throw new AppError('RATE_LIMITED', 'Too many runs from this address. Try again later.');
      }
      if (config.DAILY_RUN_CAP > 0) {
        const today = await repo.countRunsSince(startOfUtcDay());
        if (today >= config.DAILY_RUN_CAP) {
          throw new AppError(
            'BUDGET_EXHAUSTED',
            'The daily live-run limit is reached. Try a golden demo run.',
            { cap: config.DAILY_RUN_CAP },
          );
        }
      }
    }
    assertCapacity();
  }

  function assertCapacity(): void {
    if (pipeline.activeRuns >= config.MAX_CONCURRENT_RUNS) {
      throw new AppError('TOO_MANY_RUNS', 'Too many runs are in progress. Try again in a minute.');
    }
  }

  async function findRun(rawId: unknown): Promise<RunRow> {
    const id = String(rawId);
    if (!UUID.test(id)) throw new AppError('NOT_FOUND', 'Run not found.');
    const run = await repo.getRun(id);
    if (!run) throw new AppError('NOT_FOUND', 'Run not found.');
    return run;
  }

  /** The finished plan snapshot, or 409 RUN_NOT_READY. */
  async function readyPlan(rawId: unknown): Promise<Plan> {
    const run = await findRun(rawId);
    if (run.status !== 'succeeded' || run.plan === null || run.plan === undefined) {
      throw new AppError('RUN_NOT_READY', 'The plan is not finished yet.', { status: run.status });
    }
    const parsed = PlanSchema.safeParse(run.plan);
    if (!parsed.success) throw new Error('The stored plan does not match the plan schema.');
    return parsed.data;
  }

  const api = express.Router();

  api.get('/health', async (_req, res) => {
    let db = 'ok';
    try {
      await repo.ping();
    } catch {
      db = 'down';
    }
    const body: HealthResponse = {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      llm_configured: llmConfigured(config),
      // The free tier costs nothing; the daily cap counts runs (DAILY_RUN_CAP), not dollars.
      budget: { spent_today_usd: 0, cap_usd: 0 },
      version: config.version,
    };
    res.json(body);
  });

  api.post('/projects', async (req: Request, res) => {
    const parsed = CreateProjectRequestSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(
        'VALIDATION_FAILED',
        'Request validation failed.',
        zodDetails(parsed.error),
      );
    const { idea_text, config: patch, access_code } = parsed.data;

    const resolved = resolveConfig(patch ?? {});
    if (!resolved.success) {
      throw new AppError(
        'INVALID_CONFIG',
        'The configuration is not valid.',
        zodDetails(resolved.error),
      );
    }
    if (!llmConfigured(config)) {
      throw new AppError('LLM_UNAVAILABLE', 'The language model is not configured on this server.');
    }
    await guardNewRun(req, access_code);

    const { projectId, runId } = await repo.createProjectWithRun({
      ideaText: idea_text,
      config: resolved.data,
      llmProvider: llm.provider,
      llmModel: llm.model,
      promptVersions: Object.fromEntries(
        Object.entries(PROMPT_VERSIONS).map(([stage, version]) => [stage, version]),
      ),
    });
    pipeline.launch(runId);
    res.status(202).json({ project_id: projectId, run_id: runId });
  });

  api.get('/projects', async (req, res) => {
    const raw = Number(req.query['limit'] ?? 20);
    const limit = Number.isInteger(raw) ? Math.min(Math.max(raw, 1), 100) : 20;
    const rows = await repo.listProjects(limit);
    const body: ProjectListItem[] = rows.map((p) => ({
      id: p.id,
      idea_text: p.ideaText,
      created_at: p.createdAt.toISOString(),
      latest_run: p.latestRun,
    }));
    res.json(body);
  });

  api.get('/runs/:id', async (req, res) => {
    res.json(await buildRunStatus(repo, await findRun(req.params['id'])));
  });

  api.get('/runs/:id/plan', async (req, res) => {
    res.json(await readyPlan(req.params['id']));
  });

  api.post('/runs/:id/rerun', async (req: Request, res) => {
    const parent = await findRun(req.params['id']);
    const parsed = RerunRequestSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(
        'VALIDATION_FAILED',
        'Request validation failed.',
        zodDetails(parsed.error),
      );
    const { from_stage, config: patch, access_code } = parsed.data;
    if (parent.status === 'queued' || parent.status === 'running') {
      throw new AppError('INVALID_STATE', 'The run is still in progress.', {
        status: parent.status,
      });
    }
    // A stage can only be redone when every stage before it has produced its data.
    const stages = await repo.getStages(parent.id);
    let completed = 0;
    while (stages[completed]?.status === 'succeeded' || stages[completed]?.status === 'cached') {
      completed += 1;
    }
    if (from_stage > completed + 1) {
      throw new AppError(
        'INVALID_STATE',
        `The run has not completed stage ${from_stage - 1}, so it cannot be re-run from stage ${from_stage}.`,
        { completed_stages: completed },
      );
    }
    const resolved = resolveConfig(patch ?? {}, parent.config);
    if (!resolved.success) {
      throw new AppError(
        'INVALID_CONFIG',
        'The configuration is not valid.',
        zodDetails(resolved.error),
      );
    }
    if (!llmConfigured(config)) {
      throw new AppError('LLM_UNAVAILABLE', 'The language model is not configured on this server.');
    }
    await guardNewRun(req, access_code);

    const runId = await repo.createRerun({
      projectId: parent.projectId,
      parentRunId: parent.id,
      config: resolved.data,
      llmProvider: llm.provider,
      llmModel: llm.model,
      promptVersions: Object.fromEntries(Object.entries(PROMPT_VERSIONS)),
    });
    // Stages 6 and 7 keep nothing outside the final plan, so only 1-5 are copied.
    await repo.cloneRunData(parent.id, runId, Math.min(from_stage - 1, 5));
    pipeline.launch(runId, { fromStage: from_stage });
    res.status(202).json({ run_id: runId });
  });

  api.post('/runs/:id/resolve-cycle', async (req, res) => {
    const run = await findRun(req.params['id']);
    const parsed = ResolveCycleRequestSchema.safeParse(req.body);
    if (!parsed.success)
      throw new AppError(
        'VALIDATION_FAILED',
        'Request validation failed.',
        zodDetails(parsed.error),
      );
    if (run.status !== 'needs_resolution' || run.cycle === null) {
      throw new AppError('INVALID_STATE', 'The run is not waiting for a cycle resolution.', {
        status: run.status,
      });
    }
    const inCycle = new Set(run.cycle.edges.map((e) => `${e.from}->${e.to}`));
    const unknown = parsed.data.remove_edges.filter((e) => !inCycle.has(`${e.from}->${e.to}`));
    if (unknown.length > 0) {
      throw new AppError('VALIDATION_FAILED', 'Some edges are not part of the reported cycle.', {
        unknown_edges: unknown,
      });
    }
    assertCapacity();
    // Claim the run before the pipeline starts, so a second request cannot resume it twice.
    await repo.updateRun(run.id, { status: 'running' });
    pipeline.launch(run.id, { resolution: parsed.data.remove_edges });
    res.status(202).json({ run_id: run.id });
  });

  api.get('/runs/:id/export/jira.csv', async (req, res) => {
    const plan = await readyPlan(req.params['id']);
    res
      .type('text/csv; charset=utf-8')
      .attachment(`plan-${plan.run.id.slice(0, 8)}-jira.csv`)
      .send(toJiraCsv(plan));
  });

  api.get('/runs/:id/export/plan.md', async (req, res) => {
    const plan = await readyPlan(req.params['id']);
    res
      .type('text/markdown; charset=utf-8')
      .attachment(`plan-${plan.run.id.slice(0, 8)}.md`)
      .send(toMarkdown(plan));
  });

  /** Golden runs are recorded plans: no model call. */
  api.get('/demo/golden', async (_req, res) => {
    const rows = await repo.listGoldenRuns();
    res.json(rows.map((r) => ({ run_id: r.runId, idea_text: r.ideaText })));
  });

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
