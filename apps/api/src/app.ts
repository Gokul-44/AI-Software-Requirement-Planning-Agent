import { randomUUID, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import type { Express, Request } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { CreateProjectRequestSchema, resolveConfig } from '@spm/shared';
import type { HealthResponse, ProjectListItem } from '@spm/shared';
import { llmConfigured } from './config.js';
import type { AppConfig } from './config.js';
import type { Repository } from './db/repository.js';
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
  const live = llm.provider === 'gemini';

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

    if (live) {
      if (config.DEMO_ACCESS_CODE && !sameSecret(access_code, config.DEMO_ACCESS_CODE)) {
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
    if (pipeline.activeRuns >= config.MAX_CONCURRENT_RUNS) {
      throw new AppError('TOO_MANY_RUNS', 'Too many runs are in progress. Try again in a minute.');
    }

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
    const id = String(req.params['id']);
    if (!UUID.test(id)) throw new AppError('NOT_FOUND', 'Run not found.');
    const run = await repo.getRun(id);
    if (!run) throw new AppError('NOT_FOUND', 'Run not found.');
    res.json(await buildRunStatus(repo, run));
  });

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
