import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES } from '@spm/shared';
import { ApiRequestError } from '../api/errors';
import { GOLDEN_CODES, friendlyError } from './friendlyError';

describe('friendlyError', () => {
  it('has a friendly message for every C3 error code', () => {
    for (const code of API_ERROR_CODES) {
      const f = friendlyError(new ApiRequestError(code, 'server text', 400));
      expect(f.title.length).toBeGreaterThan(5);
      expect(f.message).not.toContain('server text');
      expect(f.code).toBe(code);
    }
  });

  it('offers a golden demo for the limit, budget and model errors', () => {
    for (const code of ['RATE_LIMITED', 'TOO_MANY_RUNS', 'BUDGET_EXHAUSTED', 'LLM_UNAVAILABLE']) {
      expect(friendlyError(new ApiRequestError(code, 'x', 429)).offerGolden).toBe(true);
      expect(GOLDEN_CODES.has(code)).toBe(true);
    }
    expect(friendlyError(new ApiRequestError('INVALID_CONFIG', 'x', 400)).offerGolden).toBe(false);
  });

  it('falls back for unknown errors', () => {
    expect(friendlyError(new Error('boom')).code).toBeNull();
    expect(friendlyError(new ApiRequestError('WHATEVER', 'x', 500)).title).toBe(
      'Something went wrong',
    );
  });
});
