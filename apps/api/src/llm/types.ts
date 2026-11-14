import type { ZodType } from 'zod';
import type { LlmStage } from '@spm/shared';

/**
 * Provider abstraction (MASTER_PLAN B3.2). The harness talks only to this interface; a provider
 * (gemini, mock, replay) is chosen by LLM_PROVIDER. Keys exist only on the server.
 */
export type StopReason = 'end' | 'max_tokens' | 'refusal' | 'other';

export interface LlmRequest<T> {
  stage: LlmStage;
  system: string;
  user: string;
  /** Base schema. The provider turns it into JSON Schema; the harness validates with Zod after. */
  schema: ZodType<T>;
  schemaName: string;
  /** "extract" maps to temperature 0.2 where the provider supports it; "creative" uses the default. */
  mode: 'extract' | 'creative';
  maxOutputTokens: number;
  /**
   * The stage input (what `user` was built from) and the prompt version. Real providers ignore
   * it. The mock builds its answer from `input`; replay derives its cache key from both.
   */
  context: { promptVersion: string; input: unknown };
}

export interface LlmResponse {
  /** Parsed JSON when the provider returned valid JSON, otherwise the raw text (a string). */
  raw: unknown;
  usage: { inputTokens: number; outputTokens: number };
  stopReason: StopReason;
  model: string;
  latencyMs: number;
}

export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  generateStructured<T>(req: LlmRequest<T>): Promise<LlmResponse>;
}

/** Settings that are part of the cache key. Temperature is implied by provider and mode. */
export function cacheSettings(
  req: Pick<LlmRequest<unknown>, 'mode' | 'maxOutputTokens' | 'schemaName'>,
) {
  return { mode: req.mode, maxOutputTokens: req.maxOutputTokens, schemaName: req.schemaName };
}
