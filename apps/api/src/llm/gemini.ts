import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { GenerateContentConfig } from '@google/genai';
import { toJsonSchema } from '@spm/shared';
import { LlmPermanentError, LlmQuotaError, LlmTransientError } from './errors.js';
import type { LlmClient, LlmRequest, LlmResponse, StopReason } from './types.js';

export type GeminiThinking = 'minimal' | 'low' | 'medium' | 'high';

export interface GeminiOptions {
  apiKey: string;
  model: string;
  /** Per-call timeout. A call that hangs is aborted and retried by the queue. */
  timeoutMs?: number;
  thinking?: GeminiThinking;
}

const THINKING_LEVELS: Record<GeminiThinking, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/**
 * Gemini through the official @google/genai SDK. Structured output uses
 * `config.responseMimeType = "application/json"` with `config.responseJsonSchema`
 * (JSON Schema, see GenerateContentConfig in the installed SDK). SDK retries are switched off:
 * the queue owns backoff so the server's retry delay is honoured in one place.
 */
export class GeminiLlmClient implements LlmClient {
  readonly provider = 'gemini';
  readonly model: string;
  private readonly ai: GoogleGenAI;
  private readonly timeoutMs: number;
  private readonly thinking: GeminiThinking;

  constructor(opts: GeminiOptions) {
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.thinking = opts.thinking ?? 'low';
    this.ai = new GoogleGenAI({
      apiKey: opts.apiKey,
      httpOptions: { retryOptions: { attempts: 1 } },
    });
  }

  async generateStructured<T>(req: LlmRequest<T>): Promise<LlmResponse> {
    const config: GenerateContentConfig = {
      systemInstruction: req.system,
      responseMimeType: 'application/json',
      responseJsonSchema: toGeminiSchema(toJsonSchema(req.schema)),
      maxOutputTokens: req.maxOutputTokens,
      thinkingConfig: { thinkingLevel: THINKING_LEVELS[this.thinking] },
      abortSignal: AbortSignal.timeout(this.timeoutMs),
    };
    // "extract" maps to a low temperature; "creative" keeps the model default.
    if (req.mode === 'extract') config.temperature = 0.2;

    const started = performance.now();
    let response;
    try {
      response = await this.ai.models.generateContent({
        model: this.model,
        contents: req.user,
        config,
      });
    } catch (err) {
      throw classifyError(err);
    }
    const latencyMs = Math.round(performance.now() - started);

    const candidate = response.candidates?.[0];
    const blocked = response.promptFeedback?.blockReason !== undefined;
    const usage = response.usageMetadata;
    const text = candidate ? (response.text ?? '') : '';
    return {
      raw: parseJson(text),
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        // Thinking tokens are billed and limited as output, so they are counted as output.
        outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
      },
      stopReason: blocked
        ? 'refusal'
        : mapFinishReason(candidate?.finishReason, candidate !== undefined),
      model: this.model,
      latencyMs,
    };
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function mapFinishReason(reason: string | undefined, hasCandidate: boolean): StopReason {
  if (!hasCandidate) return 'refusal';
  switch (reason) {
    case 'STOP':
    case undefined:
      return 'end';
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'SAFETY':
    case 'RECITATION':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
    case 'SPII':
      return 'refusal';
    default:
      return 'other';
  }
}

// ---------------------------------------------------------------- JSON Schema for Gemini

/** The JSON Schema keywords Gemini accepts in responseJsonSchema (from the SDK docs). */
const ALLOWED_KEYS = new Set([
  '$id',
  '$defs',
  '$ref',
  '$anchor',
  'type',
  'format',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'minimum',
  'maximum',
  'anyOf',
  'oneOf',
  'properties',
  'additionalProperties',
  'required',
]);

/**
 * Drops keywords Gemini does not support (pattern, minLength, maxLength, $schema, ...) and turns
 * `const` into a one-value `enum`. Length limits move into the description as a hint. Zod still
 * enforces every dropped constraint after parsing, and a violation costs one repair retry.
 */
export function toGeminiSchema(schema: unknown): unknown {
  return convert(schema);
}

function isNumberList(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'number');
}

function convert(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(convert);
  if (node === null || typeof node !== 'object') return node;
  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let numberChoices: number[] | null = null;
  for (const [key, value] of Object.entries(src)) {
    if (key === 'const') {
      out['enum'] = [value];
    } else if (key === 'enum' && isNumberList(value)) {
      // Numeric enums are not reliably accepted for structured output: describe them instead.
      // Zod still enforces the exact set after parsing.
      numberChoices = value;
    } else if (key === 'properties' && value !== null && typeof value === 'object') {
      // Keys of `properties` are property names, not keywords: keep them all.
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, convert(v)]),
      );
    } else if (key === '$defs' && value !== null && typeof value === 'object') {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, convert(v)]),
      );
    } else if (ALLOWED_KEYS.has(key)) {
      out[key] = convert(value);
    }
  }
  const hints: string[] = [];
  if (numberChoices !== null) {
    hints.push(`Must be exactly one of: ${numberChoices.join(', ')}.`);
    if (out['type'] === 'number' && numberChoices.every(Number.isInteger)) out['type'] = 'integer';
  }
  const maxLength = src['maxLength'];
  if (typeof maxLength === 'number') hints.push(`At most ${maxLength} characters.`);
  // Array bounds are hints too: nested minItems/maxItems made Gemini 3.6 Flash answer 400
  // INVALID_ARGUMENT for the stage 2 schema (verified), and Zod enforces them afterwards.
  const minItems = src['minItems'];
  const maxItems = src['maxItems'];
  if (typeof minItems === 'number' && typeof maxItems === 'number') {
    hints.push(`Between ${minItems} and ${maxItems} items.`);
  } else if (typeof maxItems === 'number') {
    hints.push(`At most ${maxItems} items.`);
  } else if (typeof minItems === 'number') {
    hints.push(`At least ${minItems} items.`);
  }
  if (hints.length > 0) {
    const text = hints.join(' ');
    out['description'] =
      typeof out['description'] === 'string' ? `${out['description']} ${text}` : text;
  }
  return out;
}

// ---------------------------------------------------------------- error classification

export function classifyError(err: unknown): Error {
  if (err instanceof ApiError) {
    const status = err.status;
    const retryAfterMs = parseRetryDelayMs(err.message);
    const message = `Gemini API error ${status}: ${summarise(err.message)}`;
    if (status === 429) {
      if (isDailyQuota(err.message)) return new LlmQuotaError(message, { status });
      return new LlmTransientError(message, withHint(status, retryAfterMs));
    }
    if (status === 408 || status >= 500) {
      return new LlmTransientError(message, withHint(status, retryAfterMs));
    }
    return new LlmPermanentError(message, { status });
  }
  if (err instanceof Error) {
    // fetch failures, timeouts and aborts: the network layer, worth a retry.
    return new LlmTransientError(`Gemini request failed: ${err.name}: ${err.message}`);
  }
  return new LlmTransientError('Gemini request failed.');
}

function withHint(status: number, retryAfterMs: number | undefined) {
  return retryAfterMs === undefined ? { status } : { status, retryAfterMs };
}

function summarise(message: string): string {
  try {
    const parsed = JSON.parse(message) as {
      error?: { message?: string; details?: Record<string, unknown>[] };
    };
    if (parsed.error?.message) {
      return `${parsed.error.message.slice(0, 200)}${quotaDetail(parsed.error.details)}`;
    }
  } catch {
    // not JSON
  }
  return message.slice(0, 300);
}

/**
 * Which quota was hit and when to retry, from the error details (QuotaFailure and RetryInfo).
 * Without it the message cannot tell the per-minute limit from the per-day limit.
 */
export function quotaDetail(details: readonly Record<string, unknown>[] | undefined): string {
  const parts: string[] = [];
  for (const detail of details ?? []) {
    const violations = detail['violations'];
    if (Array.isArray(violations)) {
      for (const v of violations as Record<string, unknown>[]) {
        const id = typeof v['quotaId'] === 'string' ? v['quotaId'] : null;
        const metric = typeof v['quotaMetric'] === 'string' ? v['quotaMetric'] : null;
        if (id || metric) parts.push(`quota ${id ?? ''} ${metric ? `(${metric})` : ''}`.trim());
      }
    }
    if (typeof detail['retryDelay'] === 'string') parts.push(`retry in ${detail['retryDelay']}`);
  }
  return parts.length > 0 ? ` [${parts.join('; ')}]` : '';
}

/** Reads RetryInfo ("retryDelay": "34s") or the "Please retry in 34.5s" sentence. */
export function parseRetryDelayMs(message: string): number | undefined {
  const delay =
    /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(message) ?? /retry in ([\d.]+)\s*s/i.exec(message);
  if (!delay?.[1]) return undefined;
  const seconds = Number.parseFloat(delay[1]);
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : undefined;
}

/** A per-day free-tier limit will not clear in a few seconds, so it is not retried. */
export function isDailyQuota(message: string): boolean {
  return /PerDay/i.test(message);
}
