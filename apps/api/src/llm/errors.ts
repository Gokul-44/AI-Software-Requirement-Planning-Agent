/** Errors a provider may throw. The harness never retries these itself: the queue already did. */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly options: { status?: number; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
  get status(): number | undefined {
    return this.options.status;
  }
  get retryAfterMs(): number | undefined {
    return this.options.retryAfterMs;
  }
}

/** Network failure, timeout, 408, 429 or 5xx: worth retrying with backoff. */
export class LlmTransientError extends LlmError {}

/** Bad key, bad request, unknown model: retrying cannot help. */
export class LlmPermanentError extends LlmError {}

/** Free-tier quota that will not reset soon (for example the daily limit): do not retry. */
export class LlmQuotaError extends LlmError {}

/** The replay provider has no recorded response for this call. */
export class ReplayMissError extends LlmPermanentError {}
