import { buildCacheKey } from './cache-key.js';
import { ReplayMissError } from './errors.js';
import { cacheSettings } from './types.js';
import type { LlmClient, LlmRequest, LlmResponse } from './types.js';
import type { StageCacheStore } from './cache.js';

export interface ReplayOptions {
  cache: StageCacheStore;
  /** The provider and model that recorded the responses (they are part of the cache key). */
  sourceProvider: string;
  sourceModel: string;
}

/**
 * Serves recorded responses from stage_cache. CI, offline work and the demo fallback use it: it
 * never calls a network and fails with ReplayMissError when nothing was recorded.
 */
export class ReplayLlmClient implements LlmClient {
  readonly provider = 'replay';
  readonly model: string;

  constructor(private readonly opts: ReplayOptions) {
    this.model = `replay:${opts.sourceModel}`;
  }

  async generateStructured<T>(req: LlmRequest<T>): Promise<LlmResponse> {
    const started = performance.now();
    const key = buildCacheKey({
      stage: req.stage,
      promptVersion: req.context.promptVersion,
      provider: this.opts.sourceProvider,
      model: this.opts.sourceModel,
      settings: cacheSettings(req),
      input: req.context.input,
    });
    const hit = await this.opts.cache.get(key);
    if (!hit) {
      throw new ReplayMissError(
        `No recorded response for stage ${req.stage} (key ${key.slice(0, 12)}).`,
      );
    }
    return {
      raw: hit.output,
      usage: { inputTokens: hit.inputTokens, outputTokens: hit.outputTokens },
      stopReason: 'end',
      model: this.model,
      latencyMs: Math.round(performance.now() - started),
    };
  }
}
