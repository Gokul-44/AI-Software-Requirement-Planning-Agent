import type { Logger } from 'pino';
import { LlmQuotaError, LlmTransientError } from './errors.js';
import type { LlmClient, LlmRequest, LlmResponse } from './types.js';

export interface QueueOptions {
  /** Minimum gap between the start of two calls (derived from the free-tier RPM). */
  minIntervalMs: number;
  /** Retries after the first attempt for 429/5xx/network errors. */
  maxRetries?: number;
  /** Fallback delays when the server gives no retry hint (MASTER_PLAN B3.1: 1 s, 4 s, 10 s). */
  backoffMs?: readonly number[];
  /** A server retry hint above this is treated as an exhausted quota, not waited out. */
  maxServerDelayMs?: number;
  logger?: Logger;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Wraps a client with a concurrency-1 queue, a minimum gap between calls and 429/5xx backoff
 * that honours the server's retry delay. This is the only place that retries transport errors
 * (outside the harness's repair loop, MASTER_PLAN B3.1).
 */
export class QueuedLlmClient implements LlmClient {
  private tail: Promise<unknown> = Promise.resolve();
  private lastStart = Number.NEGATIVE_INFINITY;
  private readonly maxRetries: number;
  private readonly backoff: readonly number[];
  private readonly maxServerDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    private readonly inner: LlmClient,
    private readonly opts: QueueOptions,
  ) {
    this.maxRetries = opts.maxRetries ?? 3;
    this.backoff = opts.backoffMs ?? [1000, 4000, 10000];
    this.maxServerDelayMs = opts.maxServerDelayMs ?? 120_000;
    this.sleep = opts.sleep ?? realSleep;
    this.now = opts.now ?? Date.now;
  }

  get provider(): string {
    return this.inner.provider;
  }
  get model(): string {
    return this.inner.model;
  }

  generateStructured<T>(req: LlmRequest<T>): Promise<LlmResponse> {
    const run = this.tail.then(() => this.runWithRetries(req));
    // Keep the chain alive after a failure so one bad call does not block the next.
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async waitForSlot(): Promise<void> {
    const wait = this.lastStart + this.opts.minIntervalMs - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastStart = this.now();
  }

  private async runWithRetries<T>(req: LlmRequest<T>): Promise<LlmResponse> {
    for (let attempt = 0; ; attempt++) {
      await this.waitForSlot();
      try {
        return await this.inner.generateStructured(req);
      } catch (err) {
        if (!(err instanceof LlmTransientError) || err instanceof LlmQuotaError) throw err;
        if (attempt >= this.maxRetries) throw err;
        const hint = err.retryAfterMs;
        if (hint !== undefined && hint > this.maxServerDelayMs) {
          throw new LlmQuotaError(
            `Provider asked to wait ${Math.round(hint / 1000)} s; treating the quota as exhausted.`,
            { ...err.options },
          );
        }
        const fallback = this.backoff[Math.min(attempt, this.backoff.length - 1)] ?? 1000;
        const delay = Math.max(hint ?? 0, fallback);
        this.opts.logger?.warn(
          { attempt: attempt + 1, delayMs: delay, status: err.status },
          'LLM call failed, backing off',
        );
        await this.sleep(delay);
      }
    }
  }
}
