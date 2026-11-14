import type { Logger } from 'pino';
import type { AppConfig } from '../config.js';
import type { StageCacheStore } from './cache.js';
import { GeminiLlmClient } from './gemini.js';
import { MockLlmClient } from './mock.js';
import { QueuedLlmClient } from './queue.js';
import { ReplayLlmClient } from './replay.js';
import type { LlmClient } from './types.js';

/** Builds the provider chosen by LLM_PROVIDER. Only the real network provider is queued. */
export function createLlmClient(
  config: AppConfig,
  cache: StageCacheStore,
  logger: Logger,
): LlmClient {
  switch (config.LLM_PROVIDER) {
    case 'mock':
      return new MockLlmClient();
    case 'replay':
      return new ReplayLlmClient({
        cache,
        sourceProvider: config.REPLAY_SOURCE_PROVIDER ?? 'gemini',
        sourceModel: config.REPLAY_SOURCE_MODEL ?? config.GEMINI_MODEL ?? 'unknown',
      });
    case 'gemini': {
      if (!config.GEMINI_API_KEY || !config.GEMINI_MODEL) {
        throw new Error('LLM_PROVIDER=gemini needs GEMINI_API_KEY and GEMINI_MODEL.');
      }
      return new QueuedLlmClient(
        new GeminiLlmClient({
          apiKey: config.GEMINI_API_KEY,
          model: config.GEMINI_MODEL,
          timeoutMs: config.GEMINI_TIMEOUT_MS,
          thinking: config.GEMINI_THINKING,
        }),
        { minIntervalMs: config.LLM_MIN_INTERVAL_MS, maxRetries: config.LLM_MAX_RETRIES, logger },
      );
    }
  }
}
