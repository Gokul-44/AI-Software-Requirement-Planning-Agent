import { describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { MemoryRepository } from '../db/memory-repository.js';
import { LlmQuotaError } from '../llm/errors.js';
import { createHarness } from '../llm/harness.js';
import { MockLlmClient } from '../llm/mock.js';
import type { LlmClient, LlmRequest, LlmResponse } from '../llm/types.js';
import { aggregate, coefficientOfVariation, countInvalidRefs } from './metrics.js';
import { resultsFromCsv, toCsv, toMarkdown } from './report.js';
import { planRuns, runEval } from './runner.js';
import type { EvalIdea } from './runner.js';

type Json = Record<string, unknown>;

const IDEAS: EvalIdea[] = [
  { id: 1, slug: 'food', idea: 'Online food delivery app' },
  { id: 2, slug: 'lms', idea: 'Learning management system for a college' },
  { id: 3, slug: 'hospital', idea: 'Hospital appointment booking' },
];

/** The mock provider with a hook to damage selected answers or to run out of quota. */
class Scripted implements LlmClient {
  readonly provider = 'mock';
  readonly model = 'mock-1';
  readonly seen: string[] = [];
  private readonly inner = new MockLlmClient();
  constructor(
    private readonly tamper: (name: string, out: Json, nth: number) => Json = (_n, o) => o,
    private readonly quotaAtCall = Number.POSITIVE_INFINITY,
  ) {}

  async generateStructured<T>(req: LlmRequest<T>): Promise<LlmResponse> {
    this.seen.push(req.schemaName);
    if (this.seen.length >= this.quotaAtCall) {
      throw new LlmQuotaError('Gemini API error 429: quota (PerDay) used up', { status: 429 });
    }
    const res = await this.inner.generateStructured(req);
    const nth = this.seen.filter((n) => n === req.schemaName).length;
    return { ...res, raw: this.tamper(req.schemaName, structuredClone(res.raw as Json), nth) };
  }
}

async function evaluate(llm: LlmClient, planned = planRuns(IDEAS, { limit: 1, repeatFirst: 1 })) {
  const repo = new MemoryRepository();
  const logger = pino({ level: 'silent' });
  const outcome = await runEval({
    repo,
    llm,
    harness: createHarness({ llm, cache: repo.cache, logger }),
    logger,
    planned,
  });
  return { repo, ...outcome };
}

describe('planRuns', () => {
  it('runs every idea once, then the repeats of the first idea', () => {
    const planned = planRuns(IDEAS, { limit: 2, repeatFirst: 3 });
    expect(planned.map((p) => `${p.idea.id}#${p.repeat}`)).toEqual(['1#1', '2#1', '1#2', '1#3']);
  });
  it('plans nothing for limit 0', () => {
    expect(planRuns(IDEAS, { limit: 0, repeatFirst: 3 })).toEqual([]);
  });
});

describe('countInvalidRefs', () => {
  it('counts the unknown ids, tasks outside the batch and unknown epics', () => {
    expect(
      countInvalidRefs([
        'epics.0.stories.1.requirement_ids: unknown ids R-050, R-051. Use only R-001, R-002.',
        'tasks.3.story_id: S-009 is not in this batch. Use one of S-001.',
        'stories.0.epic_id: unknown epic E-9. Use one of E-1.',
        'requirements.2: duplicates requirements.0.',
      ]),
    ).toBe(4);
  });
});

describe('coefficientOfVariation', () => {
  it('uses the sample standard deviation', () => {
    expect(coefficientOfVariation([10, 12, 14])).toBeCloseTo(2 / 12, 6);
  });
  it('needs two values and a non-zero mean', () => {
    expect(coefficientOfVariation([5])).toBeNull();
    expect(coefficientOfVariation([0, 0])).toBeNull();
  });
});

describe('runEval with the mock provider', () => {
  it('measures a clean run: every call valid first try, full coverage, no invalid reference', async () => {
    const { results, stopReason, notRun } = await evaluate(new Scripted());
    expect(stopReason).toBe('done');
    expect(notRun).toEqual([]);
    const m = results[0]?.metrics;
    expect(m?.status).toBe('succeeded');
    expect(m?.calls).toBeGreaterThanOrEqual(8);
    expect(m?.callsFirstTryValid).toBe(m?.calls);
    expect(m?.repairRetries).toBe(0);
    expect(m?.infraFailedCalls).toBe(0);
    expect(m?.stagesFailedValidation).toBe(0);
    expect(m?.coveragePct).toBe(100);
    expect(m?.refsInvalid).toBe(0);
    expect(m?.refsProposed).toBeGreaterThan(0);
    expect(m?.tasks).toBeGreaterThan(0);
    expect(m?.edgesPerTask).toBeGreaterThan(0);
    expect(m?.cpmHours).toBeGreaterThan(0);
    expect(m?.cycleBeforeRepair).toBe(false);
    expect(m?.tasksPerStoryMin).toBeLessThanOrEqual(m?.tasksPerStoryMax ?? 0);
  });

  it('counts a repair retry and the unknown reference that caused it', async () => {
    const llm = new Scripted((name, out, nth) => {
      if (name === 'Stories' && nth === 1) {
        const epics = out['epics'] as { stories: { requirement_ids: string[] }[] }[];
        epics[0]?.stories[0]?.requirement_ids.push('R-999');
      }
      return out;
    });
    const { results } = await evaluate(llm);
    const m = results[0]?.metrics;
    expect(m?.status).toBe('succeeded');
    expect(m?.repairRetries).toBe(1);
    expect((m?.callsFirstTryValid ?? 0) < (m?.calls ?? 0)).toBe(true);
    expect(m?.refsInvalid).toBe(1);
  });

  it('stops at the first quota error, keeps what was measured and lists the runs not made', async () => {
    // The quota runs out during the third model call, which is stage 3.
    const planned = planRuns(IDEAS, { limit: 3, repeatFirst: 1 });
    const { results, notRun, stopReason } = await evaluate(new Scripted(undefined, 3), planned);
    expect(stopReason).toBe('quota_exhausted');
    expect(results).toHaveLength(1);
    expect(notRun.map((p) => p.idea.id)).toEqual([2, 3]);
    const m = results[0]?.metrics;
    expect(m?.status).toBe('failed');
    expect(m?.failureCode).toBe('QUOTA_EXHAUSTED');
    expect(m?.stagesStoppedByQuota).toBe(1);
    // A quota stop is not a model failure.
    expect(m?.stagesFailedValidation).toBe(0);
    expect(m?.infraFailedCalls).toBe(1);
    expect(m?.coveragePct).toBeNull();
    const md = toMarkdown(results, {
      date: '2026-01-01',
      provider: 'mock',
      model: 'mock-1',
      minIntervalMs: 0,
      promptVersions: { '1': 'v1' },
      stopReason,
      notRun,
      requested: { limit: 3, repeatFirst: 1 },
    });
    expect(md).toContain('LIMITED BY THE FREE QUOTA');
    expect(md).toContain('idea 2 "Learning management system for a college"');
  });

  it('measures consistency over repeats and writes a parseable CSV', async () => {
    const planned = planRuns(IDEAS, { limit: 1, repeatFirst: 3 });
    const { results } = await evaluate(new Scripted(), planned);
    expect(results).toHaveLength(3);
    const csv = toCsv(results);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(4);
    const columns = lines[0]?.split(',').length ?? 0;
    for (const line of lines) expect(line.split(',').length).toBe(columns);
    const md = toMarkdown(results, {
      date: '2026-01-01',
      provider: 'mock',
      model: 'mock-1',
      minIntervalMs: 0,
      promptVersions: { '1': 'v1' },
      stopReason: 'done',
      notRun: [],
      requested: { limit: 1, repeatFirst: 3 },
    });
    expect(md).toContain('Coefficient of variation');
    expect(md).toContain('| 1. Online food delivery app | 3 |');
    // The mock is deterministic, so identical runs have a coefficient of variation of 0.
    expect(md).toContain('| 0.000 |');
  });
});

describe('resultsFromCsv', () => {
  it('reads back what toCsv wrote, so result files can be merged', async () => {
    const { results } = await evaluate(
      new Scripted(),
      planRuns(IDEAS, { limit: 2, repeatFirst: 1 }),
    );
    const csv = toCsv(results);
    const back = resultsFromCsv(csv);
    expect(back).toHaveLength(2);
    expect(toCsv(back)).toBe(csv);
    expect(back[0]?.idea.idea).toBe('Online food delivery app');
  });
  it('refuses a file that is not an evaluation CSV', () => {
    expect(() => resultsFromCsv(['a,b', '1,2', ''].join('\n'))).toThrow(/columns differ/);
  });
});

describe('aggregate', () => {
  it('has no value (null) when nothing was measured', () => {
    const agg = aggregate([]);
    expect(agg.firstTryValidPct).toBeNull();
    expect(agg.coveragePctMean).toBeNull();
    expect(agg.runSecondsMean).toBeNull();
  });
});
