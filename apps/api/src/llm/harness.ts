import type { ZodType } from 'zod';
import type { Logger } from 'pino';
import type { LlmStage } from '@spm/shared';
import { buildCacheKey } from './cache-key.js';
import type { StageCacheStore } from './cache.js';
import { LlmError, LlmQuotaError } from './errors.js';
import { cacheSettings } from './types.js';
import type { LlmClient } from './types.js';

export type StageErrorCode =
  'VALIDATION_FAILED' | 'LLM_UNAVAILABLE' | 'QUOTA_EXHAUSTED' | 'REFUSAL';

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** A stage call that could not produce a valid output. It carries what the attempts cost. */
export class StageCallError extends Error {
  constructor(
    readonly code: StageErrorCode,
    message: string,
    readonly info: {
      attempts: number;
      usage: Usage;
      latencyMs: number;
      cacheKey: string;
      errors?: string[];
    },
  ) {
    super(message);
    this.name = 'StageCallError';
  }
}

export interface StageCallSpec<T> {
  stage: LlmStage;
  promptVersion: string;
  system: string;
  /** The user message, built from `input` (the idea or stage data, inside delimiters). */
  user: string;
  /** The minimal stage input (B3.3). Hashed into the cache key. */
  input: unknown;
  /** Base schema: JSON Schema source for the provider and the structural (Zod) check. */
  schema: ZodType<T>;
  schemaName: string;
  /** Semantic check after Zod: unknown ids, counts, anything Zod cannot see. Returns errors. */
  semantic?: (value: T) => string[];
  mode?: 'extract' | 'creative';
  maxOutputTokens: number;
  /** Re-run support: ignore a cached answer and ask the model again (the new answer is cached only if the key is new). */
  bypassCache?: boolean;
}

export interface StageCallResult<T> {
  value: T;
  cached: boolean;
  /** LLM calls made (0 when served from the cache). */
  attempts: number;
  usage: Usage;
  latencyMs: number;
  model: string;
  cacheKey: string;
}

export interface HarnessOptions {
  llm: LlmClient;
  cache: StageCacheStore;
  logger?: Logger;
  /** 1 call plus up to 2 repair retries (MASTER_PLAN B3.1). */
  maxAttempts?: number;
  /** Ceiling when a truncated response makes the harness raise maxOutputTokens once. */
  maxOutputTokensCeiling?: number;
}

const MAX_REPORTED_ERRORS = 20;

export interface Harness {
  callStage<T>(spec: StageCallSpec<T>): Promise<StageCallResult<T>>;
}

export function createHarness(opts: HarnessOptions): Harness {
  const maxAttempts = opts.maxAttempts ?? 3;
  const ceiling = opts.maxOutputTokensCeiling ?? 65_536;
  const { llm, cache } = opts;

  async function callStage<T>(spec: StageCallSpec<T>): Promise<StageCallResult<T>> {
    const mode = spec.mode ?? 'extract';
    const settings = cacheSettings({
      mode,
      maxOutputTokens: spec.maxOutputTokens,
      schemaName: spec.schemaName,
    });
    const cacheKey = buildCacheKey({
      stage: spec.stage,
      promptVersion: spec.promptVersion,
      provider: llm.provider,
      model: llm.model,
      settings,
      input: spec.input,
    });

    const hit = spec.bypassCache ? null : await cache.get(cacheKey);
    if (hit) {
      const checked = check(spec, hit.output);
      if (checked.ok) {
        return {
          value: checked.value,
          cached: true,
          attempts: 0,
          usage: { inputTokens: 0, outputTokens: 0 },
          latencyMs: 0,
          model: hit.llmModel,
          cacheKey,
        };
      }
      opts.logger?.warn({ stage: spec.stage, cacheKey }, 'ignoring invalid cache entry');
    }

    const usage: Usage = { inputTokens: 0, outputTokens: 0 };
    let latencyMs = 0;
    let maxOutputTokens = spec.maxOutputTokens;
    let raisedTokens = false;
    let lastErrors: string[] = [];
    let user = spec.user;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let response;
      try {
        response = await llm.generateStructured({
          stage: spec.stage,
          system: spec.system,
          user,
          schema: spec.schema,
          schemaName: spec.schemaName,
          mode,
          maxOutputTokens,
          context: { promptVersion: spec.promptVersion, input: spec.input },
        });
      } catch (err) {
        if (err instanceof LlmError) {
          const code: StageErrorCode =
            err instanceof LlmQuotaError ? 'QUOTA_EXHAUSTED' : 'LLM_UNAVAILABLE';
          throw new StageCallError(code, err.message, {
            attempts: attempt,
            usage,
            latencyMs,
            cacheKey,
          });
        }
        throw err;
      }
      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;
      latencyMs += response.latencyMs;

      if (response.stopReason === 'refusal') {
        throw new StageCallError('REFUSAL', 'The model refused or blocked the request.', {
          attempts: attempt,
          usage,
          latencyMs,
          cacheKey,
        });
      }

      let errors: string[];
      if (response.stopReason === 'max_tokens') {
        errors = [
          'Your previous output was cut off before the JSON ended. Return a complete, shorter JSON.',
        ];
        if (!raisedTokens) {
          raisedTokens = true;
          maxOutputTokens = Math.min(maxOutputTokens * 2, ceiling);
        }
      } else {
        const checked = check(spec, response.raw);
        if (checked.ok && response.stopReason === 'end') {
          await cache.put({
            cacheKey,
            stage: spec.stage,
            promptVersion: spec.promptVersion,
            llmModel: response.model,
            output: checked.value,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
          });
          return {
            value: checked.value,
            cached: false,
            attempts: attempt,
            usage,
            latencyMs,
            model: response.model,
            cacheKey,
          };
        }
        errors = checked.ok
          ? ['The response ended for an unexpected reason. Return the full JSON again.']
          : checked.errors;
      }

      lastErrors = errors;
      opts.logger?.warn(
        { stage: spec.stage, attempt, errors: errors.slice(0, 5) },
        'stage output invalid',
      );
      user = `${spec.user}\n\nYour previous output was invalid:\n${errors.map((e) => `- ${e}`).join('\n')}\nReturn the full corrected JSON.`;
    }

    throw new StageCallError(
      'VALIDATION_FAILED',
      `Stage ${spec.stage} output was still invalid after ${maxAttempts} attempts.`,
      { attempts: maxAttempts, usage, latencyMs, cacheKey, errors: lastErrors },
    );
  }

  return { callStage };
}

type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Parse (if text), Zod structural check, then the semantic validator. */
function check<T>(spec: StageCallSpec<T>, raw: unknown): Checked<T> {
  let data = raw;
  if (typeof raw === 'string') {
    const parsed = tryParse(raw);
    if (!parsed.ok) {
      return { ok: false, errors: [`Output was not valid JSON (${parsed.reason}).`] };
    }
    data = parsed.value;
  }
  const result = spec.schema.safeParse(data);
  if (!result.success) {
    return {
      ok: false,
      errors: compact(
        result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      ),
    };
  }
  const semantic = spec.semantic?.(result.data) ?? [];
  if (semantic.length > 0) return { ok: false, errors: compact(semantic) };
  return { ok: true, value: result.data };
}

function compact(errors: string[]): string[] {
  if (errors.length <= MAX_REPORTED_ERRORS) return errors;
  return [
    ...errors.slice(0, MAX_REPORTED_ERRORS),
    `(${errors.length - MAX_REPORTED_ERRORS} more not shown)`,
  ];
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return { ok: true, value: JSON.parse(stripped) };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message.slice(0, 80) : 'parse error' };
  }
}
