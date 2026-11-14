import { describe, expect, it } from 'vitest';
import { RequirementsOutputSchema } from '@spm/shared';
import type { RequirementsOutput } from '@spm/shared';
import { MemoryRepository } from '../db/memory-repository.js';
import { LlmPermanentError, LlmQuotaError, LlmTransientError } from './errors.js';
import { StageCallError, createHarness } from './harness.js';
import type { StageCallSpec } from './harness.js';
import { MockLlmClient } from './mock.js';
import { QueuedLlmClient } from './queue.js';
import type { LlmClient, LlmRequest, LlmResponse } from './types.js';
import { validateRequirements } from '../pipeline/semantic.js';

const idea = 'I want an online food delivery app';

/** A client that returns scripted answers, one per call, and records what it was asked. */
class ScriptedClient implements LlmClient {
  readonly provider = 'scripted';
  readonly model = 'scripted-1';
  readonly requests: LlmRequest<unknown>[] = [];
  constructor(private readonly script: (Partial<LlmResponse> | Error)[]) {}

  generateStructured<T>(req: LlmRequest<T>): Promise<LlmResponse> {
    this.requests.push(req);
    const step = this.script.shift();
    if (step === undefined) throw new Error('script exhausted');
    if (step instanceof Error) return Promise.reject(step);
    return Promise.resolve({
      raw: undefined,
      usage: { inputTokens: 10, outputTokens: 20 },
      stopReason: 'end',
      model: 'scripted-1',
      latencyMs: 5,
      ...step,
    });
  }
}

async function validOutput(): Promise<RequirementsOutput> {
  const res = await new MockLlmClient().generateStructured({
    stage: 1,
    system: '',
    user: '',
    schema: RequirementsOutputSchema,
    schemaName: 'Requirements',
    mode: 'extract',
    maxOutputTokens: 1000,
    context: {
      promptVersion: 'v1',
      input: { idea, bounds: { min_requirements: 5, max_requirements: 25 } },
    },
  });
  return RequirementsOutputSchema.parse(res.raw);
}

function spec(
  overrides: Partial<StageCallSpec<RequirementsOutput>> = {},
): StageCallSpec<RequirementsOutput> {
  return {
    stage: 1,
    promptVersion: 'v1',
    system: 'system',
    user: 'user message',
    input: { idea, bounds: { min_requirements: 5, max_requirements: 25 } },
    schema: RequirementsOutputSchema,
    schemaName: 'Requirements',
    semantic: validateRequirements,
    maxOutputTokens: 1000,
    ...overrides,
  };
}

describe('callStage', () => {
  it('returns a valid output on the first attempt and caches it', async () => {
    const out = await validOutput();
    const client = new ScriptedClient([{ raw: out }]);
    const repo = new MemoryRepository();
    const harness = createHarness({ llm: client, cache: repo.cache });

    const first = await harness.callStage(spec());
    expect(first.cached).toBe(false);
    expect(first.attempts).toBe(1);
    expect(first.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(first.value.requirements.length).toBeGreaterThan(4);

    // Second call: served from stage_cache, the client is not asked again.
    const second = await harness.callStage(spec());
    expect(second.cached).toBe(true);
    expect(second.attempts).toBe(0);
    expect(second.cacheKey).toBe(first.cacheKey);
    expect(client.requests).toHaveLength(1);
  });

  it('retries once after malformed JSON and feeds the error back', async () => {
    const out = await validOutput();
    const client = new ScriptedClient([{ raw: '{"summary": "cut off' }, { raw: out }]);
    const harness = createHarness({ llm: client, cache: new MemoryRepository().cache });

    const result = await harness.callStage(spec());
    expect(result.attempts).toBe(2);
    expect(result.usage.outputTokens).toBe(40);
    expect(client.requests[1]?.user).toContain('Your previous output was invalid');
    expect(client.requests[1]?.user).toContain('not valid JSON');
  });

  it('repairs a Zod-invalid output with compact path errors', async () => {
    const out = await validOutput();
    const bad = { ...out, requirements: out.requirements.slice(0, 2) };
    const client = new ScriptedClient([{ raw: bad }, { raw: out }]);
    const harness = createHarness({ llm: client, cache: new MemoryRepository().cache });

    const result = await harness.callStage(spec());
    expect(result.attempts).toBe(2);
    const feedback = client.requests[1]?.user ?? '';
    expect(feedback).toContain('requirements');
    expect(feedback.split('\n').length).toBeLessThan(30);
  });

  it('feeds invalid references back through the semantic validator', async () => {
    const out = await validOutput();
    const first = out.requirements[0];
    if (!first) throw new Error('mock returned no requirements');
    const duplicated = { ...out, requirements: [...out.requirements, { ...first }] };
    const client = new ScriptedClient([{ raw: duplicated }, { raw: out }]);
    const harness = createHarness({ llm: client, cache: new MemoryRepository().cache });

    const result = await harness.callStage(spec());
    expect(result.attempts).toBe(2);
    expect(client.requests[1]?.user).toContain('duplicates');
  });

  it('treats max_tokens as truncation, raises the limit once and retries', async () => {
    const out = await validOutput();
    const client = new ScriptedClient([{ raw: '{"summ', stopReason: 'max_tokens' }, { raw: out }]);
    const harness = createHarness({ llm: client, cache: new MemoryRepository().cache });

    const result = await harness.callStage(spec());
    expect(result.attempts).toBe(2);
    expect(client.requests[0]?.maxOutputTokens).toBe(1000);
    expect(client.requests[1]?.maxOutputTokens).toBe(2000);
    expect(client.requests[1]?.user).toContain('cut off');
  });

  it('does not cache or accept a truncated response even if the JSON parses', async () => {
    const out = await validOutput();
    const repo = new MemoryRepository();
    const client = new ScriptedClient([
      { raw: out, stopReason: 'max_tokens' },
      { raw: out, stopReason: 'max_tokens' },
      { raw: out, stopReason: 'max_tokens' },
    ]);
    const harness = createHarness({ llm: client, cache: repo.cache });
    await expect(harness.callStage(spec())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      info: { attempts: 3 },
    });
  });

  it('fails with VALIDATION_FAILED after 3 invalid attempts and reports the errors', async () => {
    const client = new ScriptedClient([{ raw: {} }, { raw: {} }, { raw: {} }]);
    const harness = createHarness({ llm: client, cache: new MemoryRepository().cache });

    const err = await harness.callStage(spec()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StageCallError);
    const failure = err as StageCallError;
    expect(failure.code).toBe('VALIDATION_FAILED');
    expect(failure.info.attempts).toBe(3);
    expect(failure.info.usage.outputTokens).toBe(60);
    expect(failure.info.errors?.length).toBeGreaterThan(0);
  });

  it('fails at once on a refusal', async () => {
    const client = new ScriptedClient([{ raw: '', stopReason: 'refusal' }]);
    const harness = createHarness({ llm: client, cache: new MemoryRepository().cache });
    await expect(harness.callStage(spec())).rejects.toMatchObject({
      code: 'REFUSAL',
      info: { attempts: 1 },
    });
  });

  it('maps provider errors to LLM_UNAVAILABLE and QUOTA_EXHAUSTED without repair retries', async () => {
    const harness = (err: Error) =>
      createHarness({ llm: new ScriptedClient([err]), cache: new MemoryRepository().cache });
    await expect(
      harness(new LlmPermanentError('bad key', { status: 400 })).callStage(spec()),
    ).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
    });
    await expect(harness(new LlmQuotaError('daily quota')).callStage(spec())).rejects.toMatchObject(
      {
        code: 'QUOTA_EXHAUSTED',
      },
    );
  });
});

describe('QueuedLlmClient', () => {
  const request = (): LlmRequest<unknown> => ({
    stage: 1,
    system: '',
    user: '',
    schema: RequirementsOutputSchema,
    schemaName: 'Requirements',
    mode: 'extract',
    maxOutputTokens: 100,
    context: { promptVersion: 'v1', input: {} },
  });

  function clock() {
    let now = 0;
    const sleeps: number[] = [];
    return {
      sleeps,
      now: () => now,
      sleep: (ms: number) => {
        sleeps.push(ms);
        now += ms;
        return Promise.resolve();
      },
    };
  }

  it('retries a network error with the backoff 1 s, 4 s and then succeeds', async () => {
    const c = clock();
    const inner = new ScriptedClient([
      new LlmTransientError('fetch failed'),
      new LlmTransientError('fetch failed'),
      { raw: { ok: true } },
    ]);
    const queue = new QueuedLlmClient(inner, { minIntervalMs: 0, ...c });
    const res = await queue.generateStructured(request());
    expect(res.raw).toEqual({ ok: true });
    expect(c.sleeps).toEqual([1000, 4000]);
  });

  it('honours the server retry delay when it is longer than the backoff', async () => {
    const c = clock();
    const inner = new ScriptedClient([
      new LlmTransientError('429', { status: 429, retryAfterMs: 34_000 }),
      { raw: 1 },
    ]);
    const queue = new QueuedLlmClient(inner, { minIntervalMs: 0, ...c });
    await queue.generateStructured(request());
    expect(c.sleeps).toEqual([34_000]);
  });

  it('gives up after 3 retries', async () => {
    const c = clock();
    const inner = new ScriptedClient(
      Array.from({ length: 4 }, () => new LlmTransientError('503', { status: 503 })),
    );
    const queue = new QueuedLlmClient(inner, { minIntervalMs: 0, ...c });
    await expect(queue.generateStructured(request())).rejects.toBeInstanceOf(LlmTransientError);
    expect(inner.requests).toHaveLength(4);
    expect(c.sleeps).toEqual([1000, 4000, 10_000]);
  });

  it('does not retry permanent errors, and treats a very long server delay as exhausted quota', async () => {
    const c = clock();
    const permanent = new QueuedLlmClient(
      new ScriptedClient([new LlmPermanentError('bad request', { status: 400 })]),
      {
        minIntervalMs: 0,
        ...c,
      },
    );
    await expect(permanent.generateStructured(request())).rejects.toBeInstanceOf(LlmPermanentError);
    expect(c.sleeps).toEqual([]);

    const long = new QueuedLlmClient(
      new ScriptedClient([new LlmTransientError('429', { status: 429, retryAfterMs: 3_600_000 })]),
      { minIntervalMs: 0, ...c },
    );
    await expect(long.generateStructured(request())).rejects.toBeInstanceOf(LlmQuotaError);
    expect(c.sleeps).toEqual([]);
  });

  it('runs one call at a time with the minimum gap between starts', async () => {
    const c = clock();
    const starts: number[] = [];
    const inner: LlmClient = {
      provider: 'scripted',
      model: 'm',
      generateStructured: () => {
        starts.push(c.now());
        return Promise.resolve({
          raw: 1,
          usage: { inputTokens: 0, outputTokens: 0 },
          stopReason: 'end',
          model: 'm',
          latencyMs: 0,
        });
      },
    };
    const queue = new QueuedLlmClient(inner, { minIntervalMs: 6500, ...c });
    await Promise.all([
      queue.generateStructured(request()),
      queue.generateStructured(request()),
      queue.generateStructured(request()),
    ]);
    expect(starts).toEqual([0, 6500, 13_000]);
  });
});
