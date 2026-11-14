import type { Logger } from 'pino';
import { StageCallError } from '../llm/harness.js';
import type { Harness, StageCallResult, StageCallSpec } from '../llm/harness.js';
import type { LlmStage } from '@spm/shared';

/** What the calls of one stage cost, summed. */
export class Tally {
  attempts = 0;
  inputTokens = 0;
  outputTokens = 0;
  llmLatencyMs = 0;
  calls = 0;
  cachedCalls = 0;
  cacheKey: string | null = null;

  addResult(r: StageCallResult<unknown>): void {
    this.calls += 1;
    if (r.cached) this.cachedCalls += 1;
    this.attempts += r.attempts;
    this.inputTokens += r.usage.inputTokens;
    this.outputTokens += r.usage.outputTokens;
    this.llmLatencyMs += r.latencyMs;
    this.cacheKey ??= r.cacheKey;
  }

  addFailure(err: StageCallError): void {
    this.calls += 1;
    this.attempts += err.info.attempts;
    this.inputTokens += err.info.usage.inputTokens;
    this.outputTokens += err.info.usage.outputTokens;
    this.llmLatencyMs += err.info.latencyMs;
    this.cacheKey ??= err.info.cacheKey;
  }

  get allCached(): boolean {
    return this.calls > 0 && this.cachedCalls === this.calls;
  }
}

/** A stage failed in a way that is not a harness error (for example the task cap). */
export class StageFailure extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'StageFailure';
  }
}

/** What a stage helper needs: the harness (cache bypass already decided), a logger and the tally. */
export interface StageContext {
  harness: Harness;
  logger: Logger;
  tally: Tally;
}

/** One harness call whose cost is added to the stage tally. */
export async function tracked<T>(ctx: StageContext, spec: StageCallSpec<T>) {
  const result = await ctx.harness.callStage(spec);
  ctx.tally.addResult(result);
  return result;
}

/**
 * A coverage or repair retry is best effort: if it still returns invalid output the gap becomes a
 * warning (never a failed run). Provider outages and quota errors still fail the stage.
 */
export async function bestEffort<T>(ctx: StageContext, call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof StageCallError && err.code === 'VALIDATION_FAILED') {
      ctx.tally.addFailure(err);
      ctx.logger.warn({ errors: err.info.errors?.slice(0, 5) }, 'targeted retry stayed invalid');
      return null;
    }
    throw err;
  }
}

export const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type { LlmStage };
