import { describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { DEFAULT_CONFIG } from '@spm/shared';
import { MemoryRepository } from '../db/memory-repository.js';
import { createHarness } from '../llm/harness.js';
import { MockLlmClient } from '../llm/mock.js';
import type { LlmClient, LlmRequest, LlmResponse } from '../llm/types.js';
import { Pipeline } from './orchestrator.js';

type Json = Record<string, unknown>;

/** The mock provider, with a hook that can damage selected outputs (to exercise coverage). */
class Tampered implements LlmClient {
  readonly provider = 'mock';
  readonly model = 'mock-1';
  readonly calls: string[] = [];
  private readonly inner = new MockLlmClient();
  constructor(private readonly tamper: (schemaName: string, out: Json, call: number) => Json) {}

  async generateStructured<T>(req: LlmRequest<T>): Promise<LlmResponse> {
    this.calls.push(req.schemaName);
    const res = await this.inner.generateStructured(req);
    const count = this.calls.filter((c) => c === req.schemaName).length;
    return { ...res, raw: this.tamper(req.schemaName, structuredClone(res.raw as Json), count) };
  }
}

async function run(llm: LlmClient) {
  const repo = new MemoryRepository();
  const pipeline = new Pipeline({
    repo,
    harness: createHarness({ llm, cache: repo.cache }),
    logger: pino({ level: 'silent' }),
  });
  const { runId } = await repo.createProjectWithRun({
    ideaText: 'I want an online food delivery app',
    config: DEFAULT_CONFIG,
    llmProvider: llm.provider,
    llmModel: llm.model,
    promptVersions: {},
  });
  await pipeline.execute(runId);
  return { repo, runId };
}

type Epic = { stories: { requirement_ids: string[] }[] };
/** Removes the story that serves requirement id, so no story links to it. */
const dropRequirement = (out: Json, id: string) => {
  for (const epic of out['epics'] as Epic[]) {
    epic.stories = epic.stories.filter((s) => !s.requirement_ids.includes(id));
  }
};

describe('coverage C1 (every requirement has a story)', () => {
  it('makes one targeted retry for an uncovered requirement and then passes', async () => {
    const llm = new Tampered((name, out) => {
      if (name === 'Stories') dropRequirement(out, 'R-003');
      return out;
    });
    const { repo, runId } = await run(llm);
    expect(llm.calls.filter((c) => c === 'CoverageStories')).toHaveLength(1);
    const core = await repo.loadCore(runId);
    expect(core.stories.some((s) => s.requirementCodes.includes('R-003'))).toBe(true);
    expect(core.issues).toEqual([]);
    expect((await repo.getRun(runId))?.status).toBe('succeeded');
  });

  it('records an uncovered_requirement warning when the retry does not help', async () => {
    const llm = new Tampered((name, out) => {
      if (name === 'Stories') dropRequirement(out, 'R-003');
      if (name === 'CoverageStories') {
        for (const s of out['stories'] as { requirement_ids: string[] }[])
          s.requirement_ids = ['R-001'];
      }
      return out;
    });
    const { repo, runId } = await run(llm);
    expect(llm.calls.filter((c) => c === 'CoverageStories')).toHaveLength(1);
    const core = await repo.loadCore(runId);
    expect(core.issues).toEqual([
      expect.objectContaining({
        code: 'I-001',
        stage: 2,
        severity: 'warning',
        kind: 'uncovered_requirement',
        refs: ['R-003'],
      }),
    ]);
    const counts = await repo.countIssuesBySeverity(runId);
    expect(counts).toEqual({ error: 0, warning: 1 });
    expect((await repo.getRun(runId))?.status).toBe('succeeded');
  });
});

describe('coverage C2 (every story has a task)', () => {
  it('retries once for stories without tasks, then records a warning', async () => {
    let target = '';
    const llm = new Tampered((name, out) => {
      if (name !== 'Tasks') return out;
      const tasks = out['tasks'] as { story_id: string }[];
      target ||= tasks[0]?.story_id ?? '';
      // Remove every task of one story, on the first attempt and on its targeted retry.
      out['tasks'] = tasks.filter((t) => t.story_id !== target);
      return out;
    });
    const { repo, runId } = await run(llm);
    const core = await repo.loadCore(runId);
    const issue = core.issues.find((i) => i.kind === 'story_without_tasks');
    expect(issue).toMatchObject({ stage: 3, severity: 'warning', refs: [target] });
    expect(core.tasks.some((t) => t.storyCode === target)).toBe(false);
    expect((await repo.getRun(runId))?.status).toBe('succeeded');
  });
});

describe('failures', () => {
  it('fails the run with a STAGE_FAILED error when a stage stays invalid', async () => {
    const llm = new Tampered((name, out) => (name === 'Stories' ? { epics: [] } : out));
    const { repo, runId } = await run(llm);
    const row = await repo.getRun(runId);
    expect(row?.status).toBe('failed');
    expect(row?.error).toMatchObject({
      stage: 2,
      code: 'STAGE_FAILED',
      details: { code: 'VALIDATION_FAILED', attempts: 3 },
    });
    const stages = await repo.getStages(runId);
    expect(stages.map((s) => s.status).slice(0, 3)).toEqual(['succeeded', 'failed', 'pending']);
    expect(stages[1]?.attempts).toBe(3);
  });

  it('marks later stages cached when the same idea is run again', async () => {
    const repo = new MemoryRepository();
    const pipeline = new Pipeline({
      repo,
      harness: createHarness({ llm: new MockLlmClient(), cache: repo.cache }),
      logger: pino({ level: 'silent' }),
    });
    const make = () =>
      repo.createProjectWithRun({
        ideaText: 'I want an online food delivery app',
        config: DEFAULT_CONFIG,
        llmProvider: 'mock',
        llmModel: 'mock-1',
        promptVersions: {},
      });
    const first = await make();
    await pipeline.execute(first.runId);
    const second = await make();
    await pipeline.execute(second.runId);
    const stages = await repo.getStages(second.runId);
    expect(stages.slice(0, 3).map((s) => [s.status, s.attempts])).toEqual([
      ['cached', 0],
      ['cached', 0],
      ['cached', 0],
    ]);
  });
});
