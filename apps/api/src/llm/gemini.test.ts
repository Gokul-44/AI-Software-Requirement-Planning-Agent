import { describe, expect, it } from 'vitest';
import { ApiError } from '@google/genai';
import {
  DependenciesOutputSchema,
  EstimatesOutputSchema,
  RequirementsOutputSchema,
  RisksOutputSchema,
  StoriesOutputSchema,
  TasksOutputSchema,
  toJsonSchema,
} from '@spm/shared';
import {
  classifyError,
  isDailyQuota,
  mapFinishReason,
  parseRetryDelayMs,
  toGeminiSchema,
} from './gemini.js';
import { LlmPermanentError, LlmQuotaError, LlmTransientError } from './errors.js';

const KEYWORDS_GEMINI_REJECTS = [
  'minItems',
  'maxItems',
  'pattern',
  'minLength',
  'maxLength',
  '$schema',
  'const',
  'uniqueItems',
];

/** Collects every JSON Schema keyword in use (property names are skipped). */
function keywords(node: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    node.forEach((n) => keywords(n, out));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'properties' || k === '$defs') {
        Object.values(v as object).forEach((child) => keywords(child, out));
      } else {
        out.add(k);
        keywords(v, out);
      }
    }
  }
  return out;
}

describe('toGeminiSchema', () => {
  it('drops keywords Gemini rejects and keeps structure', () => {
    for (const schema of [
      RequirementsOutputSchema,
      StoriesOutputSchema,
      TasksOutputSchema,
      EstimatesOutputSchema,
      DependenciesOutputSchema,
      RisksOutputSchema,
    ]) {
      const used = keywords(toGeminiSchema(toJsonSchema(schema)));
      for (const bad of KEYWORDS_GEMINI_REJECTS) expect(used.has(bad)).toBe(false);
      expect(used.has('required')).toBe(true);
      expect(used.has('additionalProperties')).toBe(true);
    }
  });

  it('turns the numeric points enum into a described integer (stage 4)', () => {
    const out = toGeminiSchema(toJsonSchema(EstimatesOutputSchema)) as {
      properties: { estimates: { items: { properties: { points: Record<string, unknown> } } } };
    };
    const points = out.properties.estimates.items.properties.points;
    expect(points['enum']).toBeUndefined();
    expect(points['type']).toBe('integer');
    expect(points['description']).toContain('1, 2, 3, 5, 8, 13');
  });

  it('keeps property names that look like keywords and hints the length limit', () => {
    const out = toGeminiSchema({
      type: 'object',
      properties: { pattern: { type: 'string', maxLength: 5, minLength: 1 }, k: { const: 'x' } },
    }) as { properties: Record<string, Record<string, unknown>> };
    expect(Object.keys(out.properties)).toEqual(['pattern', 'k']);
    expect(out.properties['pattern']?.['description']).toContain('At most 5 characters');
    expect(out.properties['k']).toEqual({ enum: ['x'] });
  });
});

describe('error handling', () => {
  it('reads the server retry delay', () => {
    expect(parseRetryDelayMs('{"error":{"details":[{"retryDelay":"34s"}]}}')).toBe(34_000);
    expect(parseRetryDelayMs('Please retry in 2.5s.')).toBe(2500);
    expect(parseRetryDelayMs('nothing')).toBeUndefined();
  });

  it('classifies statuses', () => {
    const api = (status: number, message: string) => new ApiError({ message, status });
    expect(classifyError(api(429, 'Please retry in 10s'))).toMatchObject({ retryAfterMs: 10_000 });
    expect(classifyError(api(429, 'Please retry in 10s'))).toBeInstanceOf(LlmTransientError);
    expect(
      classifyError(api(429, 'quota GenerateRequestsPerDayPerProjectPerModel')),
    ).toBeInstanceOf(LlmQuotaError);
    expect(classifyError(api(503, 'overloaded'))).toBeInstanceOf(LlmTransientError);
    expect(classifyError(api(400, 'bad'))).toBeInstanceOf(LlmPermanentError);
    expect(classifyError(api(404, 'model not found'))).toBeInstanceOf(LlmPermanentError);
    expect(classifyError(new TypeError('fetch failed'))).toBeInstanceOf(LlmTransientError);
    expect(isDailyQuota('PerMinute')).toBe(false);
  });

  it('maps finish reasons', () => {
    expect(mapFinishReason('STOP', true)).toBe('end');
    expect(mapFinishReason('MAX_TOKENS', true)).toBe('max_tokens');
    expect(mapFinishReason('SAFETY', true)).toBe('refusal');
    expect(mapFinishReason(undefined, false)).toBe('refusal');
    expect(mapFinishReason('OTHER', true)).toBe('other');
  });
});
