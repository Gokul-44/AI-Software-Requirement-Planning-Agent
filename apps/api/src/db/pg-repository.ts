import pg from 'pg';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { Config, StageError, StageStatus } from '@spm/shared';
import type { StageCacheEntry } from '../llm/cache.js';
import { INTERRUPTED_ERROR, STAGE_COUNT, issueCode } from './repository.js';
import type {
  EpicRow,
  IssueDraft,
  IssueRow,
  NewRunInput,
  ProjectListRow,
  RequirementRow,
  Repository,
  RunPatch,
  RunRow,
  RunStatusValue,
  StagePatch,
  StageRow,
  StoryRow,
  TaskRow,
} from './repository.js';

export interface PoolOptions {
  /** Pooled Neon connection string (host contains "-pooler"). Never log it. */
  connectionString: string;
  max?: number;
  /** Set a search_path on every connection (used by tests to stay inside their own schema). */
  schema?: string;
}

/**
 * Pool settings for Neon (neon-postgres skill): the pooled endpoint for the API, a small pool
 * because PgBouncer multiplexes, TLS from the `sslmode` in the URL, and a connect timeout long
 * enough for a scale-to-zero cold start.
 */
export function createPool(opts: PoolOptions): Pool {
  const pool = new pg.Pool({
    connectionString: normaliseSsl(opts.connectionString),
    max: opts.max ?? 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 20_000,
    keepAlive: true,
  });
  if (opts.schema) {
    const schema = opts.schema;
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Invalid schema name.');
    pool.on('connect', (client) => {
      void client.query(`SET search_path TO ${schema}, public`);
    });
  }
  return pool;
}

/** Spells out the behaviour pg already applies to sslmode=require (full certificate check). */
export function normaliseSsl(url: string): string {
  return url.replace(/([?&]sslmode=)(require|prefer|verify-ca)(?=&|$)/, '$1verify-full');
}

type Row = QueryResultRow;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export class PgRepository implements Repository {
  readonly cache = {
    get: async (cacheKey: string): Promise<StageCacheEntry | null> => {
      const { rows } = await this.pool.query<Row>(
        `SELECT cache_key, stage, prompt_version, llm_model, output, input_tokens, output_tokens
           FROM stage_cache WHERE cache_key = $1`,
        [cacheKey],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        cacheKey: String(r['cache_key']).trim(),
        stage: num(r['stage']),
        promptVersion: String(r['prompt_version']),
        llmModel: String(r['llm_model']),
        output: r['output'],
        inputTokens: num(r['input_tokens']),
        outputTokens: num(r['output_tokens']),
      };
    },
    put: async (e: StageCacheEntry): Promise<void> => {
      await this.pool.query(
        `INSERT INTO stage_cache (cache_key, stage, prompt_version, llm_model, output, input_tokens, output_tokens)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
         ON CONFLICT (cache_key) DO NOTHING`,
        [
          e.cacheKey,
          e.stage,
          e.promptVersion,
          e.llmModel,
          JSON.stringify(e.output),
          e.inputTokens,
          e.outputTokens,
        ],
      );
    },
  };

  constructor(private readonly pool: Pool) {}

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  private async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async createProjectWithRun(input: NewRunInput): Promise<{ projectId: string; runId: string }> {
    return this.tx(async (c) => {
      const project = await c.query<Row>(
        'INSERT INTO projects (idea_text) VALUES ($1) RETURNING id',
        [input.ideaText],
      );
      const projectId = String(project.rows[0]?.['id']);
      const run = await c.query<Row>(
        `INSERT INTO runs (project_id, config, llm_provider, llm_model, prompt_versions)
         VALUES ($1, $2::jsonb, $3, $4, $5::jsonb) RETURNING id`,
        [
          projectId,
          JSON.stringify(input.config),
          input.llmProvider,
          input.llmModel,
          JSON.stringify(input.promptVersions),
        ],
      );
      const runId = String(run.rows[0]?.['id']);
      await c.query(
        `INSERT INTO stage_executions (run_id, stage, status)
         SELECT $1, s, 'pending' FROM generate_series(1, $2) AS s`,
        [runId, STAGE_COUNT],
      );
      return { projectId, runId };
    });
  }

  async getRun(runId: string): Promise<RunRow | null> {
    const { rows } = await this.pool.query<Row>(
      `SELECT r.*, p.idea_text FROM runs r JOIN projects p ON p.id = r.project_id WHERE r.id = $1`,
      [runId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: String(r['id']),
      projectId: String(r['project_id']),
      ideaText: String(r['idea_text']),
      status: r['status'] as RunStatusValue,
      currentStage: num(r['current_stage']),
      config: r['config'] as Config,
      llmProvider: String(r['llm_provider']),
      llmModel: String(r['llm_model']),
      promptVersions: r['prompt_versions'] as Record<string, string>,
      summary: (r['summary'] as string | null) ?? null,
      assumptions: (r['assumptions'] as string[]) ?? [],
      inputTokens: num(r['input_tokens']),
      outputTokens: num(r['output_tokens']),
      estCostUsd: num(r['est_cost_usd']),
      error: (r['error'] as StageError | null) ?? null,
      plan: r['plan'] ?? null,
      createdAt: r['created_at'] as Date,
      finishedAt: (r['finished_at'] as Date | null) ?? null,
    };
  }

  async updateRun(runId: string, patch: RunPatch): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [runId];
    const add = (column: string, value: unknown, cast = '') => {
      values.push(value);
      sets.push(`${column} = $${values.length}${cast}`);
    };
    if (patch.status !== undefined) add('status', patch.status);
    if (patch.currentStage !== undefined) add('current_stage', patch.currentStage);
    if (patch.summary !== undefined) add('summary', patch.summary);
    if (patch.assumptions !== undefined) add('assumptions', patch.assumptions);
    if (patch.inputTokens !== undefined) add('input_tokens', patch.inputTokens);
    if (patch.outputTokens !== undefined) add('output_tokens', patch.outputTokens);
    if (patch.error !== undefined)
      add('error', patch.error === null ? null : JSON.stringify(patch.error), '::jsonb');
    if (patch.plan !== undefined)
      add('plan', patch.plan === null ? null : JSON.stringify(patch.plan), '::jsonb');
    if (patch.finishedAt !== undefined) add('finished_at', patch.finishedAt);
    if (sets.length === 0) return;
    await this.pool.query(`UPDATE runs SET ${sets.join(', ')} WHERE id = $1`, values);
  }

  async getStages(runId: string): Promise<StageRow[]> {
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM stage_executions WHERE run_id = $1 ORDER BY stage',
      [runId],
    );
    return rows.map((r) => ({
      stage: num(r['stage']),
      status: r['status'] as StageStatus,
      cacheKey: r['cache_key'] === null ? null : String(r['cache_key']).trim(),
      attempts: num(r['attempts']),
      inputTokens: num(r['input_tokens']),
      outputTokens: num(r['output_tokens']),
      costUsd: num(r['cost_usd']),
      latencyMs: r['latency_ms'] === null ? null : num(r['latency_ms']),
      error: r['error'] ?? null,
      startedAt: (r['started_at'] as Date | null) ?? null,
      finishedAt: (r['finished_at'] as Date | null) ?? null,
    }));
  }

  async updateStage(runId: string, stage: number, patch: StagePatch): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [runId, stage];
    const add = (column: string, value: unknown, cast = '') => {
      values.push(value);
      sets.push(`${column} = $${values.length}${cast}`);
    };
    if (patch.status !== undefined) add('status', patch.status);
    if (patch.cacheKey !== undefined) add('cache_key', patch.cacheKey);
    if (patch.attempts !== undefined) add('attempts', patch.attempts);
    if (patch.inputTokens !== undefined) add('input_tokens', patch.inputTokens);
    if (patch.outputTokens !== undefined) add('output_tokens', patch.outputTokens);
    if (patch.latencyMs !== undefined) add('latency_ms', patch.latencyMs);
    if (patch.error !== undefined)
      add('error', patch.error === null ? null : JSON.stringify(patch.error), '::jsonb');
    if (patch.startedAt !== undefined) add('started_at', patch.startedAt);
    if (patch.finishedAt !== undefined) add('finished_at', patch.finishedAt);
    if (sets.length === 0) return;
    await this.pool.query(
      `UPDATE stage_executions SET ${sets.join(', ')} WHERE run_id = $1 AND stage = $2`,
      values,
    );
  }

  async countIssuesBySeverity(runId: string): Promise<{ error: number; warning: number }> {
    const { rows } = await this.pool.query<Row>(
      `SELECT severity, count(*)::int AS n FROM plan_issues WHERE run_id = $1 GROUP BY severity`,
      [runId],
    );
    const count = (severity: string) => num(rows.find((r) => r['severity'] === severity)?.['n']);
    return { error: count('error'), warning: count('warning') };
  }

  async listProjects(limit: number): Promise<ProjectListRow[]> {
    const { rows } = await this.pool.query<Row>(
      `SELECT p.id, p.idea_text, p.created_at, r.id AS run_id, r.status AS run_status
         FROM projects p
         LEFT JOIN LATERAL (
           SELECT id, status FROM runs WHERE project_id = p.id ORDER BY created_at DESC LIMIT 1
         ) r ON true
        ORDER BY p.created_at DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      id: String(r['id']),
      ideaText: String(r['idea_text']),
      createdAt: r['created_at'] as Date,
      latestRun: r['run_id']
        ? { id: String(r['run_id']), status: r['run_status'] as RunStatusValue }
        : null,
    }));
  }

  async countRunsSince(since: Date): Promise<number> {
    const { rows } = await this.pool.query<Row>(
      'SELECT count(*)::int AS n FROM runs WHERE created_at >= $1',
      [since],
    );
    return num(rows[0]?.['n']);
  }

  async markInterruptedRuns(): Promise<string[]> {
    return this.tx(async (c) => {
      const { rows } = await c.query<Row>(
        `UPDATE runs
            SET status = 'failed',
                finished_at = now(),
                error = jsonb_build_object(
                  'stage', LEAST(GREATEST(current_stage, 1), $2::int),
                  'code', 'STAGE_FAILED',
                  'message', $1::text,
                  'details', jsonb_build_object('reason', 'INTERRUPTED'))
          WHERE status IN ('queued', 'running')
        RETURNING id, current_stage`,
        [INTERRUPTED_ERROR(1).message, STAGE_COUNT],
      );
      const ids = rows.map((r) => String(r['id']));
      if (ids.length > 0) {
        await c.query(
          `UPDATE stage_executions
              SET status = 'failed', finished_at = now(),
                  error = $2::jsonb
            WHERE run_id = ANY($1::uuid[]) AND status = 'running'`,
          [ids, JSON.stringify({ reason: 'INTERRUPTED' })],
        );
      }
      return ids;
    });
  }

  async saveRequirements(runId: string, rows: RequirementRow[]): Promise<void> {
    await this.tx(async (c) => {
      await c.query('DELETE FROM requirements WHERE run_id = $1', [runId]);
      if (rows.length === 0) return;
      await c.query(
        `INSERT INTO requirements (run_id, code, type, category, text, priority)
         SELECT $1, x.code, x.type, x.category, x.text, x.priority
           FROM jsonb_to_recordset($2::jsonb)
                AS x(code text, type text, category text, text text, priority text)`,
        [runId, JSON.stringify(rows)],
      );
    });
  }

  async saveStoryTree(runId: string, epics: EpicRow[], stories: StoryRow[]): Promise<void> {
    await this.tx(async (c) => {
      // Deleting epics cascades to stories, story_requirements and tasks of this run only.
      await c.query('DELETE FROM epics WHERE run_id = $1', [runId]);
      if (epics.length > 0) {
        await c.query(
          `INSERT INTO epics (run_id, code, title, description)
           SELECT $1, x.code, x.title, x.description
             FROM jsonb_to_recordset($2::jsonb) AS x(code text, title text, description text)`,
          [runId, JSON.stringify(epics)],
        );
      }
      if (stories.length === 0) return;
      const payload = stories.map((s) => ({
        code: s.code,
        epic_code: s.epicCode,
        as_a: s.asA,
        i_want: s.iWant,
        so_that: s.soThat,
        acceptance_criteria: s.acceptanceCriteria,
        priority: s.priority,
      }));
      await c.query(
        `INSERT INTO stories (run_id, code, epic_code, as_a, i_want, so_that, acceptance_criteria, priority)
         SELECT $1, x.code, x.epic_code, x.as_a, x.i_want, x.so_that,
                ARRAY(SELECT jsonb_array_elements_text(x.acceptance_criteria)), x.priority
           FROM jsonb_to_recordset($2::jsonb)
                AS x(code text, epic_code text, as_a text, i_want text, so_that text,
                     acceptance_criteria jsonb, priority text)`,
        [runId, JSON.stringify(payload)],
      );
      const links = stories.flatMap((s) =>
        s.requirementCodes.map((r) => ({ story_code: s.code, requirement_code: r })),
      );
      if (links.length > 0) {
        await c.query(
          `INSERT INTO story_requirements (run_id, story_code, requirement_code)
           SELECT $1, x.story_code, x.requirement_code
             FROM jsonb_to_recordset($2::jsonb) AS x(story_code text, requirement_code text)
           ON CONFLICT DO NOTHING`,
          [runId, JSON.stringify(links)],
        );
      }
    });
  }

  async saveTasks(runId: string, rows: TaskRow[]): Promise<void> {
    await this.tx(async (c) => {
      await c.query('DELETE FROM tasks WHERE run_id = $1', [runId]);
      if (rows.length === 0) return;
      const payload = rows.map((t) => ({
        code: t.code,
        story_code: t.storyCode,
        title: t.title,
        description: t.description,
        layer: t.layer,
      }));
      await c.query(
        `INSERT INTO tasks (run_id, code, story_code, title, description, layer)
         SELECT $1, x.code, x.story_code, x.title, x.description, x.layer
           FROM jsonb_to_recordset($2::jsonb)
                AS x(code text, story_code text, title text, description text, layer text)`,
        [runId, JSON.stringify(payload)],
      );
    });
  }

  async replaceIssuesFromStage(runId: string, stage: number, issues: IssueDraft[]): Promise<void> {
    await this.tx(async (c) => {
      await c.query('DELETE FROM plan_issues WHERE run_id = $1 AND stage >= $2', [runId, stage]);
      if (issues.length === 0) return;
      const { rows } = await c.query<Row>(
        `SELECT COALESCE(MAX(substring(code from 3)::int), 0) AS n FROM plan_issues WHERE run_id = $1`,
        [runId],
      );
      let next = num(rows[0]?.['n']);
      const payload = issues.map((i) => ({
        code: issueCode(++next),
        stage: i.stage,
        severity: i.severity,
        kind: i.kind,
        message: i.message,
        refs: i.refs,
        resolution: i.resolution,
      }));
      await c.query(
        `INSERT INTO plan_issues (run_id, code, stage, severity, kind, message, refs, resolution)
         SELECT $1, x.code, x.stage, x.severity, x.kind, x.message,
                ARRAY(SELECT jsonb_array_elements_text(x.refs)), x.resolution
           FROM jsonb_to_recordset($2::jsonb)
                AS x(code text, stage int, severity text, kind text, message text, refs jsonb, resolution text)`,
        [runId, JSON.stringify(payload)],
      );
    });
  }

  async loadCore(runId: string) {
    const q = <T extends Row>(sql: string) => this.pool.query<T>(sql, [runId]);
    const [reqs, epics, stories, links, tasks, issues] = await Promise.all([
      q('SELECT * FROM requirements WHERE run_id = $1 ORDER BY code'),
      q('SELECT * FROM epics WHERE run_id = $1 ORDER BY code'),
      q('SELECT * FROM stories WHERE run_id = $1 ORDER BY code'),
      q('SELECT * FROM story_requirements WHERE run_id = $1 ORDER BY story_code, requirement_code'),
      q('SELECT * FROM tasks WHERE run_id = $1 ORDER BY code'),
      q('SELECT * FROM plan_issues WHERE run_id = $1 ORDER BY code'),
    ]);
    const linkMap = new Map<string, string[]>();
    for (const l of links.rows) {
      const list = linkMap.get(String(l['story_code'])) ?? [];
      list.push(String(l['requirement_code']));
      linkMap.set(String(l['story_code']), list);
    }
    return {
      requirements: reqs.rows.map((r) => ({
        code: String(r['code']),
        type: r['type'],
        category: r['category'] ?? null,
        text: String(r['text']),
        priority: r['priority'],
      })) as RequirementRow[],
      epics: epics.rows.map((r) => ({
        code: String(r['code']),
        title: String(r['title']),
        description: String(r['description']),
      })),
      stories: stories.rows.map((r) => ({
        code: String(r['code']),
        epicCode: String(r['epic_code']),
        asA: String(r['as_a']),
        iWant: String(r['i_want']),
        soThat: String(r['so_that']),
        acceptanceCriteria: r['acceptance_criteria'] as string[],
        priority: r['priority'],
        requirementCodes: linkMap.get(String(r['code'])) ?? [],
      })) as StoryRow[],
      tasks: tasks.rows.map((r) => ({
        code: String(r['code']),
        storyCode: String(r['story_code']),
        title: String(r['title']),
        description: String(r['description']),
        layer: r['layer'],
      })) as TaskRow[],
      issues: issues.rows.map((r) => ({
        code: String(r['code']),
        stage: num(r['stage']),
        severity: r['severity'],
        kind: r['kind'],
        message: String(r['message']),
        refs: r['refs'] as string[],
        resolution: (r['resolution'] as string | null) ?? null,
      })) as IssueRow[],
    };
  }
}
