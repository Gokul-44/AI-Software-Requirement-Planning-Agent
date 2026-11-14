import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pino } from 'pino';
import { PlanSchema, RunStatusSchema, assertPlanIntegrity, DEFAULT_CONFIG } from '@spm/shared';
import type { ApiError, Plan, RunStatus } from '@spm/shared';
import { ApiErrorSchema } from '@spm/shared';
import { createApp } from '../app.js';
import { loadConfig } from '../config.js';
import { MemoryRepository } from '../db/memory-repository.js';
import { createHarness } from '../llm/harness.js';
import { MockLlmClient } from '../llm/mock.js';
import type { LlmClient, LlmRequest, LlmResponse } from '../llm/types.js';
import { recordGolden } from '../scripts/golden.js';
import { SINGLE_CALL_MAX_TASKS, proposeEdges, suspiciousEdges } from './dependencies.js';
import { Tally } from './support.js';
import { Pipeline } from './orchestrator.js';

const FOOD = 'I want an online food delivery app';

type Json = Record<string, unknown>;
type Tamper = (schemaName: string, out: Json, req: LlmRequest<unknown>) => Json | void;

/** The mock provider with a call log and a hook that can damage selected outputs. */
class Spy implements LlmClient {
  readonly provider = 'mock';
  readonly model = 'mock-1';
  readonly calls: { stage: number; schemaName: string }[] = [];
  private readonly inner = new MockLlmClient();
  constructor(private readonly tamper: Tamper = () => undefined) {}

  async generateStructured<T>(req: LlmRequest<T>): Promise<LlmResponse> {
    this.calls.push({ stage: req.stage, schemaName: req.schemaName });
    const res = await this.inner.generateStructured(req);
    const out = structuredClone(res.raw as Json);
    const changed = this.tamper(req.schemaName, out, req as LlmRequest<unknown>);
    return { ...res, raw: changed ?? out };
  }

  count(predicate: (c: { stage: number; schemaName: string }) => boolean): number {
    return this.calls.filter(predicate).length;
  }
}

function setup(llm: LlmClient, env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    LLM_PROVIDER: 'mock',
    LOG_LEVEL: 'silent',
    ...env,
  });
  const logger = pino({ level: 'silent' });
  const repo = new MemoryRepository();
  const pipeline = new Pipeline({
    repo,
    harness: createHarness({ llm, cache: repo.cache }),
    logger,
  });
  const app = createApp({ config, repo, llm, pipeline, logger });
  return { app, repo, pipeline, config };
}

async function startRun(ctx: ReturnType<typeof setup>, idea = FOOD) {
  const res = await request(ctx.app).post('/api/projects').send({ idea_text: idea });
  expect(res.status).toBe(202);
  await ctx.pipeline.idle();
  return (res.body as { run_id: string }).run_id;
}

const statusOf = async (ctx: ReturnType<typeof setup>, runId: string): Promise<RunStatus> =>
  RunStatusSchema.parse((await request(ctx.app).get(`/api/runs/${runId}`)).body);

async function planOf(ctx: ReturnType<typeof setup>, runId: string): Promise<Plan> {
  const res = await request(ctx.app).get(`/api/runs/${runId}/plan`);
  expect(res.status).toBe(200);
  const plan = PlanSchema.parse(res.body);
  assertPlanIntegrity(plan);
  return plan;
}

function expectError(res: request.Response, status: number, code: string): ApiError {
  expect(res.status).toBe(status);
  const body = ApiErrorSchema.parse(res.body);
  expect(body.error.code).toBe(code);
  return body;
}

type Deps = { dependencies: { task_id: string; depends_on: string[]; reason: string }[] };

describe('full pipeline (mock provider)', () => {
  it('turns an idea into a valid, persisted, exportable plan', async () => {
    const llm = new Spy();
    const ctx = setup(llm);
    const runId = await startRun(ctx);

    const plan = await planOf(ctx, runId);
    expect(plan.run.id).toBe(runId);
    expect(plan.run.status).toBe('succeeded');
    expect(plan.requirements.length).toBeGreaterThanOrEqual(5);
    expect(plan.tasks.length).toBeGreaterThan(plan.stories.length);
    expect(
      plan.tasks.every((t) => t.hours === DEFAULT_CONFIG.points_to_hours[String(t.points) as '1']),
    ).toBe(true);
    expect(plan.dependencies.length).toBeGreaterThan(0);
    expect(plan.dependencies.every((d) => d.type === 'FS')).toBe(true);
    expect(plan.schedule.sprints.length).toBeGreaterThanOrEqual(1);
    expect(plan.schedule.tasks).toHaveLength(plan.tasks.length);
    expect(plan.schedule.cpm.duration_hours).toBeGreaterThan(0);
    expect(plan.risks.length).toBeGreaterThanOrEqual(1);
    expect(plan.run.llm.prompt_versions['7']).toBe('v1');

    // Every risk cites at least one real signal; severity is the highest severity it cites.
    const rank = { low: 0, medium: 1, high: 2 } as const;
    for (const risk of plan.risks) {
      expect(risk.signal_ids.length).toBeGreaterThanOrEqual(1);
      const cited = risk.signal_ids.map((id) => plan.signals.find((s) => s.id === id));
      expect(cited.every((s) => s !== undefined)).toBe(true);
      const top = Math.max(...cited.map((s) => rank[s?.severity ?? 'low']));
      expect(rank[risk.severity]).toBe(top);
    }

    // One call per stage, in order (stage 4 and 5 fit one call each for this small plan).
    expect(llm.count((c) => c.stage === 4)).toBe(1);
    expect(llm.count((c) => c.stage === 5)).toBe(1);
    expect(llm.count((c) => c.stage === 7)).toBe(1);

    // Persisted atomically, once, and readable back.
    expect(ctx.repo.planWrites).toBe(1);
    const run = await ctx.repo.getRun(runId);
    expect(run?.status).toBe('succeeded');
    expect(run?.finishedAt?.toISOString()).toBe(plan.run.finished_at);

    // Exports go through @spm/exporters.
    const csv = await request(ctx.app).get(`/api/runs/${runId}/export/jira.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('attachment');
    expect(csv.text.split('\n')[0]).toContain('Issue Id');
    const md = await request(ctx.app).get(`/api/runs/${runId}/export/plan.md`);
    expect(md.status).toBe(200);
    expect(md.headers['content-type']).toContain('text/markdown');
    expect(md.text).toContain('Sprint');
  });

  it('answers 409 RUN_NOT_READY for an unfinished run and 404 for an unknown one', async () => {
    const ctx = setup(new Spy());
    const { runId } = await ctx.repo.createProjectWithRun({
      ideaText: FOOD,
      config: DEFAULT_CONFIG,
      llmProvider: 'mock',
      llmModel: 'mock-1',
      promptVersions: {},
    });
    for (const route of ['plan', 'export/jira.csv', 'export/plan.md']) {
      expectError(await request(ctx.app).get(`/api/runs/${runId}/${route}`), 409, 'RUN_NOT_READY');
    }
    expectError(
      await request(ctx.app).get('/api/runs/00000000-0000-4000-8000-000000000000/plan'),
      404,
      'NOT_FOUND',
    );
  });
});

describe('stage 4 (estimation)', () => {
  it('makes one targeted retry for a missing task and uses hours from the config', async () => {
    const llm = new Spy((name, out) => {
      if (name === 'Estimates') {
        (out as { estimates: unknown[] }).estimates.splice(2, 1); // the third task has no estimate
      }
    });
    const ctx = setup(llm);
    const res = await request(ctx.app)
      .post('/api/projects')
      .send({ idea_text: FOOD, config: { points_to_hours: { '3': 15 } } });
    await ctx.pipeline.idle();
    const runId = (res.body as { run_id: string }).run_id;

    expect(llm.count((c) => c.schemaName === 'EstimatesMissing')).toBe(1);
    const plan = await planOf(ctx, runId);
    expect(plan.issues.some((i) => i.kind === 'missing_estimate')).toBe(false);
    expect(plan.tasks).toHaveLength(plan.schedule.tasks.length);
    const threes = plan.tasks.filter((t) => t.points === 3);
    expect(threes.length).toBeGreaterThan(0);
    expect(threes.every((t) => t.hours === 15)).toBe(true);
  });

  it('assumes a default estimate and warns when the retry does not help', async () => {
    const llm = new Spy((name, out) => {
      if (name === 'Estimates' || name === 'EstimatesMissing') {
        const list = (out as { estimates: { task_id: string }[] }).estimates;
        (out as { estimates: unknown[] }).estimates = list.filter((e) => e.task_id !== 'T-003');
      }
    });
    const ctx = setup(llm);
    const runId = await startRun(ctx);
    expect(llm.count((c) => c.schemaName === 'EstimatesMissing')).toBe(1);
    const plan = await planOf(ctx, runId);
    const issue = plan.issues.find((i) => i.kind === 'missing_estimate');
    expect(issue).toMatchObject({ stage: 4, severity: 'warning', refs: ['T-003'] });
    expect(plan.tasks.find((t) => t.id === 'T-003')?.points).toBe(3);
  });

  it('drops estimates for unknown task ids and records an issue', async () => {
    const llm = new Spy((name, out) => {
      if (name === 'Estimates') {
        (out as { estimates: unknown[] }).estimates.push({
          task_id: 'T-777',
          points: 5,
          rationale: 'invented',
        });
      }
    });
    const ctx = setup(llm);
    const plan = await planOf(ctx, await startRun(ctx));
    expect(plan.tasks.some((t) => t.id === 'T-777')).toBe(false);
    expect(plan.issues).toContainEqual(
      expect.objectContaining({ stage: 4, kind: 'unknown_reference', refs: ['T-777'] }),
    );
  });

  it('flags a 13-point task as oversized', async () => {
    const llm = new Spy((name, out) => {
      if (name === 'Estimates') {
        const first = (out as { estimates: { points: number }[] }).estimates[0];
        if (first) first.points = 13;
      }
    });
    const ctx = setup(llm);
    const plan = await planOf(ctx, await startRun(ctx));
    expect(plan.issues).toContainEqual(
      expect.objectContaining({ stage: 4, kind: 'oversized_task', refs: ['T-001'] }),
    );
    expect(plan.tasks[0]?.points).toBe(13);
  });
});

describe('stage 5 (dependencies)', () => {
  it('drops fake ids, self-loops and duplicates and records each one', async () => {
    const llm = new Spy((name, out) => {
      if (name !== 'Dependencies') return;
      (out as Deps).dependencies.push(
        { task_id: 'T-002', depends_on: ['T-999'], reason: 'fake id' },
        { task_id: 'T-005', depends_on: ['T-005'], reason: 'self loop' },
        { task_id: 'T-777', depends_on: ['T-001'], reason: 'fake task' },
      );
      // The same pair twice: take an existing edge and repeat it.
      const first = (out as Deps).dependencies[0];
      if (first) (out as Deps).dependencies.push({ ...first });
    });
    const ctx = setup(llm);
    const plan = await planOf(ctx, await startRun(ctx));
    const kinds = plan.issues.filter((i) => i.stage === 5).map((i) => i.kind);
    expect(kinds).toContain('unknown_reference');
    expect(kinds).toContain('self_loop');
    expect(kinds).toContain('duplicate_edge');
    const ids = new Set(plan.tasks.map((t) => t.id));
    expect(
      plan.dependencies.every((d) => ids.has(d.from) && ids.has(d.to) && d.from !== d.to),
    ).toBe(true);
    const refs = plan.issues.filter((i) => i.kind === 'unknown_reference').flatMap((i) => i.refs);
    expect(refs).toEqual(expect.arrayContaining(['T-999', 'T-777']));
    expect(plan.dependencies.some((d) => d.from === 'T-999' || d.to === 'T-777')).toBe(false);
  });

  it('flags an edge against the usual layer order but keeps it', async () => {
    const edges = suspiciousEdges(
      [
        { from: 'T-001', to: 'T-002', source: 'llm', reason: null },
        { from: 'T-003', to: 'T-004', source: 'llm', reason: null },
      ],
      new Map([
        ['T-001', 'frontend'],
        ['T-002', 'database'],
        ['T-003', 'database'],
        ['T-004', 'frontend'],
      ]),
    );
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ kind: 'suspicious_edge', refs: ['T-001', 'T-002'] });
  });

  it('uses per-epic calls plus one cross-epic call above 80 tasks', async () => {
    const epics = ['E-001', 'E-002', 'E-003'].map((id) => ({ id, title: `Epic ${id}` }));
    const tasks = Array.from({ length: SINGLE_CALL_MAX_TASKS + 10 }, (_, i) => ({
      id: `T-${String(i + 1).padStart(3, '0')}`,
      title: `Task ${i + 1}`,
      layer: (['backend', 'frontend', 'testing'] as const)[i % 3] ?? 'backend',
      story_id: `S-${String(Math.floor(i / 3) + 1).padStart(3, '0')}`,
      epic_id: epics[i % 3]?.id ?? 'E-001',
    }));
    const llm = new Spy();
    const repo = new MemoryRepository();
    const ctx = {
      harness: createHarness({ llm, cache: repo.cache }),
      logger: pino({ level: 'silent' }),
      tally: new Tally(),
    };
    const passes = await proposeEdges(ctx, tasks, epics);
    expect(llm.count((c) => c.schemaName === 'DependenciesEpic')).toBe(3);
    expect(llm.count((c) => c.schemaName === 'DependenciesCross')).toBe(1);
    expect(llm.count((c) => c.schemaName === 'Dependencies')).toBe(0);
    expect(passes).toHaveLength(4);
    const epicOf = new Map(tasks.map((t) => [t.id, t.epic_id]));
    const cross = passes[3] ?? [];
    expect(cross.length).toBeGreaterThan(0);
    expect(cross.every((e) => epicOf.get(e.from) !== epicOf.get(e.to))).toBe(true);
  });
});

/** T-001 -> T-002 -> T-003 is a chain in the mock plan; T-003 -> T-001 closes it. */
const addCycle: Tamper = (name, out) => {
  if (name === 'Dependencies') {
    (out as Deps).dependencies.push({
      task_id: 'T-001',
      depends_on: ['T-003'],
      reason: 'forced cycle',
    });
  }
};
/** A repair call that changes nothing: the cycle survives. */
const uselessRepair: Tamper = (name, _out, req) => {
  if (name !== 'DependenciesRepair') return;
  const input = req.context.input as {
    groups: { dependencies: { task_id: string; depends_on: string[] }[] }[];
  };
  return {
    dependencies: input.groups.flatMap((g) =>
      g.dependencies.map((d) => ({ ...d, reason: 'unchanged' })),
    ),
  };
};

describe('cycles (B1 Issue 3)', () => {
  it('repairs a cycle with one SCC-limited call and logs every removed edge', async () => {
    const llm = new Spy(addCycle); // the mock repair keeps only forward edges
    const ctx = setup(llm);
    const runId = await startRun(ctx);

    expect(llm.count((c) => c.schemaName === 'DependenciesRepair')).toBe(1);
    const repairCall = llm.calls.find((c) => c.schemaName === 'DependenciesRepair');
    expect(repairCall?.stage).toBe(5);
    const status = await statusOf(ctx, runId);
    expect(status.status).toBe('succeeded');
    const plan = await planOf(ctx, runId);
    const repaired = plan.issues.filter((i) => i.kind === 'cycle_repaired');
    expect(repaired).toEqual([
      expect.objectContaining({ stage: 5, refs: ['T-003', 'T-001'], severity: 'warning' }),
    ]);
    expect(plan.dependencies.some((d) => d.from === 'T-003' && d.to === 'T-001')).toBe(false);
    expect(plan.signals.some((s) => s.kind === 'cycle_repaired')).toBe(true);
  });

  it('sends the repair call only the tasks and edges of the cycle', async () => {
    const seen: unknown[] = [];
    const spy = new Spy((name, out, req) => {
      addCycle(name, out, req);
      if (name === 'DependenciesRepair') seen.push(req.context.input);
    });
    const ctx = setup(spy);
    await startRun(ctx);
    const input = seen[0] as {
      groups: { tasks: { id: string }[]; dependencies: { task_id: string }[] }[];
    };
    expect(input.groups).toHaveLength(1);
    expect(input.groups[0]?.tasks.map((t) => t.id)).toEqual(['T-001', 'T-002', 'T-003']);
    expect(input.groups[0]?.dependencies).toHaveLength(3);
  });

  it('waits in needs_resolution when the cycle survives, and resolve-cycle finishes the run', async () => {
    const llm = new Spy((name, out, req) => {
      addCycle(name, out, req);
      return uselessRepair(name, out, req);
    });
    const ctx = setup(llm);
    const runId = await startRun(ctx);

    const waiting = await statusOf(ctx, runId);
    expect(waiting.status).toBe('needs_resolution');
    expect(waiting.current_stage).toBe(5);
    expect(waiting.cycle?.task_ids).toEqual(['T-001', 'T-002', 'T-003']);
    expect(waiting.cycle?.edges).toEqual(
      expect.arrayContaining([
        { from: 'T-001', to: 'T-002' },
        { from: 'T-002', to: 'T-003' },
        { from: 'T-003', to: 'T-001' },
      ]),
    );
    expect(waiting.stages[4]?.status).toBe('running');
    expect(waiting.stages[5]?.status).toBe('pending');
    expect(waiting.issues_count.error).toBe(1);
    expect(llm.count((c) => c.schemaName === 'DependenciesRepair')).toBe(1); // ONE repair call
    expectError(await request(ctx.app).get(`/api/runs/${runId}/plan`), 409, 'RUN_NOT_READY');
    expect((await ctx.repo.loadCore(runId)).dependencies.length).toBeGreaterThan(0);

    // An edge that is not in the cycle is refused and changes nothing.
    expectError(
      await request(ctx.app)
        .post(`/api/runs/${runId}/resolve-cycle`)
        .send({ remove_edges: [{ from: 'T-001', to: 'T-009' }] }),
      400,
      'VALIDATION_FAILED',
    );
    expect((await statusOf(ctx, runId)).status).toBe('needs_resolution');

    const res = await request(ctx.app)
      .post(`/api/runs/${runId}/resolve-cycle`)
      .send({ remove_edges: [{ from: 'T-003', to: 'T-001' }] });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ run_id: runId });
    await ctx.pipeline.idle();

    const done = await statusOf(ctx, runId);
    expect(done.status).toBe('succeeded');
    expect(done.cycle).toBeNull();
    expect(done.stages.every((s) => s.status === 'succeeded')).toBe(true);
    expect(done.issues_count.error).toBe(0);
    const plan = await planOf(ctx, runId);
    expect(plan.issues.filter((i) => i.kind === 'cycle')).toEqual([]);
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        kind: 'cycle_repaired',
        stage: 5,
        refs: ['T-003', 'T-001'],
        resolution: 'Removed by the user.',
      }),
    );
    expect(plan.signals.some((s) => s.kind === 'cycle_repaired')).toBe(true);
    expect(plan.dependencies.some((d) => d.from === 'T-003' && d.to === 'T-001')).toBe(false);
    expect(llm.count((c) => c.schemaName === 'DependenciesRepair')).toBe(1);

    // The run is no longer waiting.
    expectError(
      await request(ctx.app)
        .post(`/api/runs/${runId}/resolve-cycle`)
        .send({ remove_edges: [{ from: 'T-003', to: 'T-001' }] }),
      409,
      'INVALID_STATE',
    );
  });

  it('stays in needs_resolution when the removed edge does not break every cycle', async () => {
    const llm = new Spy((name, out, req) => {
      addCycle(name, out, req);
      if (name === 'Dependencies') {
        // A second, separate cycle: T-004 <-> T-005 is not repaired either.
        (out as Deps).dependencies.push(
          { task_id: 'T-004', depends_on: ['T-005'], reason: 'second cycle' },
          { task_id: 'T-005', depends_on: ['T-004'], reason: 'second cycle' },
        );
      }
      return uselessRepair(name, out, req);
    });
    const ctx = setup(llm);
    const runId = await startRun(ctx);
    const waiting = await statusOf(ctx, runId);
    expect(waiting.status).toBe('needs_resolution');
    expect(waiting.cycle?.task_ids).toEqual(expect.arrayContaining(['T-001', 'T-004', 'T-005']));

    await request(ctx.app)
      .post(`/api/runs/${runId}/resolve-cycle`)
      .send({ remove_edges: [{ from: 'T-003', to: 'T-001' }] });
    await ctx.pipeline.idle();
    const again = await statusOf(ctx, runId);
    expect(again.status).toBe('needs_resolution');
    expect(again.cycle?.task_ids).toEqual(['T-004', 'T-005']);

    await request(ctx.app)
      .post(`/api/runs/${runId}/resolve-cycle`)
      .send({ remove_edges: [{ from: 'T-005', to: 'T-004' }] });
    await ctx.pipeline.idle();
    expect((await statusOf(ctx, runId)).status).toBe('succeeded');
    const plan = await planOf(ctx, runId);
    expect(plan.issues.filter((i) => i.kind === 'cycle_repaired')).toHaveLength(2);
  });
});

describe('stage 7 (risks)', () => {
  it('rejects a risk that cites an unknown signal and keeps the rest', async () => {
    const llm = new Spy((name, out) => {
      if (name === 'Risks') {
        (out as { risks: unknown[] }).risks.push({
          title: 'Invented risk',
          description: 'Based on nothing.',
          mitigation: 'None.',
          signal_ids: ['SG-99'],
        });
      }
    });
    const ctx = setup(llm);
    const plan = await planOf(ctx, await startRun(ctx));
    expect(plan.risks.some((r) => r.title === 'Invented risk')).toBe(false);
    expect(plan.risks.length).toBeGreaterThanOrEqual(1);
    expect(plan.risks.every((r) => r.origin === 'llm')).toBe(true);
    const rejected = plan.issues.filter((i) => i.kind === 'risk_rejected');
    expect(rejected).toEqual([
      expect.objectContaining({ stage: 7, refs: ['SG-99'], severity: 'warning' }),
    ]);
    const known = new Set(plan.signals.map((s) => s.id));
    expect(plan.risks.every((r) => r.signal_ids.every((id) => known.has(id)))).toBe(true);
  });

  it('rejects a risk that mixes a real and a fake signal', async () => {
    const llm = new Spy((name, out) => {
      if (name !== 'Risks') return;
      const first = (out as { risks: { signal_ids: string[] }[] }).risks[0];
      if (first) first.signal_ids = [...first.signal_ids, 'SG-98'];
    });
    const ctx = setup(llm);
    const plan = await planOf(ctx, await startRun(ctx));
    expect(plan.issues.filter((i) => i.kind === 'risk_rejected')).toHaveLength(1);
    expect(plan.risks.every((r) => !r.signal_ids.includes('SG-98'))).toBe(true);
  });

  it('uses template risks when nothing survives', async () => {
    const llm = new Spy((name, out) => {
      if (name === 'Risks') {
        for (const r of (out as { risks: { signal_ids: string[] }[] }).risks) {
          r.signal_ids = ['SG-99'];
        }
      }
    });
    const ctx = setup(llm);
    const plan = await planOf(ctx, await startRun(ctx));
    expect(plan.risks.length).toBeGreaterThanOrEqual(1);
    expect(plan.risks.every((r) => r.origin === 'template')).toBe(true);
    expect(plan.issues.filter((i) => i.kind === 'risk_rejected').length).toBeGreaterThanOrEqual(1);
    const top = plan.signals.some((s) => s.severity === 'high') ? 'high' : null;
    if (top) {
      const highIds = plan.signals.filter((s) => s.severity === 'high').map((s) => s.id);
      expect(plan.risks.map((r) => r.signal_ids[0]).sort()).toEqual(highIds.slice(0, 8).sort());
      expect(plan.risks.every((r) => r.severity === 'high')).toBe(true);
    }
  });

  it('falls back to template risks when the model keeps returning a risk with no signal', async () => {
    const llm = new Spy((name, out) => {
      if (name === 'Risks') {
        for (const r of (out as { risks: { signal_ids: string[] }[] }).risks) r.signal_ids = [];
      }
    });
    const ctx = setup(llm);
    const runId = await startRun(ctx);
    expect(llm.count((c) => c.stage === 7)).toBe(3); // 1 call + 2 repair retries, then the fallback
    expect((await statusOf(ctx, runId)).status).toBe('succeeded');
    const plan = await planOf(ctx, runId);
    expect(plan.risks.every((r) => r.origin === 'template' && r.signal_ids.length >= 1)).toBe(true);
    expect(plan.issues.some((i) => i.kind === 'risk_rejected')).toBe(true);
  });
});

describe('re-run (POST /runs/:id/rerun)', () => {
  it('from stage 6 makes no model call for stages 1-5 and links to the parent', async () => {
    const llm = new Spy();
    const ctx = setup(llm);
    const parentId = await startRun(ctx);
    const callsAfterFirst = llm.calls.length;
    const parentPlan = await planOf(ctx, parentId);

    const res = await request(ctx.app)
      .post(`/api/runs/${parentId}/rerun`)
      .send({ from_stage: 6, config: { team_size: 2 } });
    expect(res.status).toBe(202);
    const childId = (res.body as { run_id: string }).run_id;
    expect(childId).not.toBe(parentId);
    await ctx.pipeline.idle();

    const fresh = llm.calls.slice(callsAfterFirst);
    expect(fresh.filter((c) => c.stage <= 5)).toEqual([]);
    expect(fresh.filter((c) => c.stage === 7)).toHaveLength(1); // stage 7 is redone
    const status = await statusOf(ctx, childId);
    expect(status.status).toBe('succeeded');
    expect(status.stages.slice(0, 5).map((s) => [s.status, s.attempts ?? 0])).toEqual(
      Array.from({ length: 5 }, () => ['cached', 0]),
    );
    expect(status.stages.slice(5).map((s) => s.status)).toEqual([
      'succeeded',
      'succeeded',
      'succeeded',
    ]);
    expect((await ctx.repo.getRun(childId))?.parentRunId).toBe(parentId);

    const plan = await planOf(ctx, childId);
    expect(plan.run.id).toBe(childId);
    expect(plan.project.id).toBe(parentPlan.project.id);
    expect(plan.run.config.team_size).toBe(2);
    expect(plan.schedule.capacity_plan.capacity_points_per_sprint).toBe(20);
    expect(plan.tasks).toEqual(parentPlan.tasks);
    expect(plan.dependencies).toEqual(parentPlan.dependencies);
    expect(plan.schedule.capacity_plan.sprint_count).toBeGreaterThanOrEqual(
      parentPlan.schedule.capacity_plan.sprint_count,
    );
  });

  it('from stage 4 asks again for stages 4, 5 and 7 but not for stages 1-3', async () => {
    const llm = new Spy();
    const ctx = setup(llm);
    const parentId = await startRun(ctx);
    const before = llm.calls.length;
    const res = await request(ctx.app).post(`/api/runs/${parentId}/rerun`).send({ from_stage: 4 });
    expect(res.status).toBe(202);
    await ctx.pipeline.idle();
    const fresh = llm.calls.slice(before);
    expect(fresh.filter((c) => c.stage <= 3)).toEqual([]);
    expect(fresh.filter((c) => c.stage === 4)).toHaveLength(1);
    expect(fresh.filter((c) => c.stage === 5)).toHaveLength(1);
    const childId = (res.body as { run_id: string }).run_id;
    expect((await statusOf(ctx, childId)).status).toBe('succeeded');
  });

  it('keeps the edges a user removed when a re-run starts after stage 5', async () => {
    const llm = new Spy((name, out, req) => {
      addCycle(name, out, req);
      return uselessRepair(name, out, req);
    });
    const ctx = setup(llm);
    const parentId = await startRun(ctx);
    await request(ctx.app)
      .post(`/api/runs/${parentId}/resolve-cycle`)
      .send({ remove_edges: [{ from: 'T-003', to: 'T-001' }] });
    await ctx.pipeline.idle();
    const before = llm.calls.length;

    const res = await request(ctx.app).post(`/api/runs/${parentId}/rerun`).send({ from_stage: 6 });
    await ctx.pipeline.idle();
    expect(llm.calls.slice(before).filter((c) => c.stage <= 5)).toEqual([]);
    const plan = await planOf(ctx, (res.body as { run_id: string }).run_id);
    expect(plan.dependencies.some((d) => d.from === 'T-003' && d.to === 'T-001')).toBe(false);
    expect(plan.issues.some((i) => i.kind === 'cycle_repaired')).toBe(true);
  });

  it('rejects a run that is in progress, a stage that has no data yet and a bad config', async () => {
    const ctx = setup(new Spy());
    const parentId = await startRun(ctx);

    expectError(
      await request(ctx.app).post(`/api/runs/${parentId}/rerun`).send({ from_stage: 9 }),
      400,
      'VALIDATION_FAILED',
    );
    expectError(
      await request(ctx.app)
        .post(`/api/runs/${parentId}/rerun`)
        .send({ from_stage: 6, config: { team_size: 1, velocity_points_per_person: 5 } }),
      400,
      'INVALID_CONFIG',
    );
    expectError(
      await request(ctx.app)
        .post('/api/runs/00000000-0000-4000-8000-000000000000/rerun')
        .send({ from_stage: 6 }),
      404,
      'NOT_FOUND',
    );

    const { runId: busy } = await ctx.repo.createProjectWithRun({
      ideaText: FOOD,
      config: DEFAULT_CONFIG,
      llmProvider: 'mock',
      llmModel: 'mock-1',
      promptVersions: {},
    });
    await ctx.repo.updateRun(busy, { status: 'running' });
    expectError(
      await request(ctx.app).post(`/api/runs/${busy}/rerun`).send({ from_stage: 1 }),
      409,
      'INVALID_STATE',
    );
    await ctx.repo.updateRun(busy, { status: 'failed' });
    expectError(
      await request(ctx.app).post(`/api/runs/${busy}/rerun`).send({ from_stage: 5 }),
      409,
      'INVALID_STATE',
    );
    // Stage 1 can always be redone, and so can a failed run's first stage.
    expect(
      (await request(ctx.app).post(`/api/runs/${busy}/rerun`).send({ from_stage: 1 })).status,
    ).toBe(202);
    await ctx.pipeline.idle();
  });
});

describe('protection (F4) for live runs', () => {
  /** The provider is "gemini" in the config (so the limits apply); the injected client is the mock. */
  const live = (env: Record<string, string> = {}) =>
    setup(new Spy(), {
      LLM_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'test-placeholder',
      GEMINI_MODEL: 'test-model',
      RATE_LIMIT_RUNS_PER_HOUR: '100',
      MAX_CONCURRENT_RUNS: '10',
      ...env,
    });

  it('answers 429 BUDGET_EXHAUSTED once DAILY_RUN_CAP runs exist today (counted from runs)', async () => {
    const ctx = live({ DAILY_RUN_CAP: '2' });
    for (let i = 0; i < 2; i++) {
      await ctx.repo.createProjectWithRun({
        ideaText: `Earlier idea number ${i} for the cap`,
        config: DEFAULT_CONFIG,
        llmProvider: 'gemini',
        llmModel: 'test-model',
        promptVersions: {},
      });
    }
    const body = expectError(
      await request(ctx.app).post('/api/projects').send({ idea_text: FOOD }),
      429,
      'BUDGET_EXHAUSTED',
    );
    expect(body.error.details).toEqual({ cap: 2 });
  });

  it('counts accepted runs and applies the cap to re-runs too', async () => {
    const ctx = live({ DAILY_RUN_CAP: '2' });
    const first = await request(ctx.app).post('/api/projects').send({ idea_text: FOOD });
    expect(first.status).toBe(202);
    await ctx.pipeline.idle();
    const runId = (first.body as { run_id: string }).run_id;
    expect(
      (await request(ctx.app).post(`/api/runs/${runId}/rerun`).send({ from_stage: 6 })).status,
    ).toBe(202);
    await ctx.pipeline.idle();
    expectError(
      await request(ctx.app).post(`/api/runs/${runId}/rerun`).send({ from_stage: 6 }),
      429,
      'BUDGET_EXHAUSTED',
    );
    expectError(
      await request(ctx.app).post('/api/projects').send({ idea_text: FOOD }),
      429,
      'BUDGET_EXHAUSTED',
    );
  });

  it('limits runs per IP per hour', async () => {
    const ctx = live({ RATE_LIMIT_RUNS_PER_HOUR: '1', DAILY_RUN_CAP: '0' });
    expect((await request(ctx.app).post('/api/projects').send({ idea_text: FOOD })).status).toBe(
      202,
    );
    expectError(
      await request(ctx.app).post('/api/projects').send({ idea_text: FOOD }),
      429,
      'RATE_LIMITED',
    );
    await ctx.pipeline.idle();
  });

  it('requires the access code when DEMO_ACCESS_CODE is set (projects and re-runs)', async () => {
    const ctx = live({ DEMO_ACCESS_CODE: 'let-me-in', DAILY_RUN_CAP: '0' });
    expectError(
      await request(ctx.app).post('/api/projects').send({ idea_text: FOOD }),
      401,
      'ACCESS_CODE_REQUIRED',
    );
    expectError(
      await request(ctx.app).post('/api/projects').send({ idea_text: FOOD, access_code: 'nope' }),
      401,
      'ACCESS_CODE_REQUIRED',
    );
    const ok = await request(ctx.app)
      .post('/api/projects')
      .send({ idea_text: FOOD, access_code: 'let-me-in' });
    expect(ok.status).toBe(202);
    await ctx.pipeline.idle();
    const runId = (ok.body as { run_id: string }).run_id;
    expectError(
      await request(ctx.app).post(`/api/runs/${runId}/rerun`).send({ from_stage: 6 }),
      401,
      'ACCESS_CODE_REQUIRED',
    );
    expect(
      (
        await request(ctx.app)
          .post(`/api/runs/${runId}/rerun`)
          .send({ from_stage: 6, access_code: 'let-me-in' })
      ).status,
    ).toBe(202);
    await ctx.pipeline.idle();
  });
});

describe('golden demo runs', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('records a plan file, lists it in index.json and marks the run golden', async () => {
    const llm = new Spy();
    const ctx = setup(llm);
    expect((await request(ctx.app).get('/api/demo/golden')).body).toEqual([]);

    const outDir = mkdtempSync(path.join(os.tmpdir(), 'spm-golden-'));
    dirs.push(outDir);
    const result = await recordGolden({
      idea: FOOD,
      repo: ctx.repo,
      pipeline: ctx.pipeline,
      llm,
      outDir,
    });
    expect(result.file).toBe(path.join(outDir, 'i-want-an-online-food-delivery-app.json'));

    const plan = PlanSchema.parse(JSON.parse(readFileSync(result.file, 'utf8')));
    assertPlanIntegrity(plan);
    expect(plan.run.id).toBe(result.runId);
    expect(JSON.parse(readFileSync(path.join(outDir, 'index.json'), 'utf8'))).toEqual([
      'i-want-an-online-food-delivery-app.json',
    ]);
    expect((await ctx.repo.getRun(result.runId))?.isGolden).toBe(true);

    // The API lists golden runs without calling the model.
    const calls = llm.calls.length;
    const list = await request(ctx.app).get('/api/demo/golden');
    expect(list.body).toEqual([{ run_id: result.runId, idea_text: FOOD }]);
    expect(llm.calls.length).toBe(calls);

    // Recording again keeps one index entry.
    await recordGolden({ idea: FOOD, repo: ctx.repo, pipeline: ctx.pipeline, llm, outDir });
    expect(JSON.parse(readFileSync(path.join(outDir, 'index.json'), 'utf8'))).toHaveLength(1);
  });

  it('refuses to write a golden file when the run did not succeed', async () => {
    const llm = new Spy((name, out) => (name === 'Stories' ? { epics: [] } : out));
    const ctx = setup(llm);
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'spm-golden-'));
    dirs.push(outDir);
    await expect(
      recordGolden({ idea: FOOD, repo: ctx.repo, pipeline: ctx.pipeline, llm, outDir }),
    ).rejects.toThrow(/failed/i);
  });
});
