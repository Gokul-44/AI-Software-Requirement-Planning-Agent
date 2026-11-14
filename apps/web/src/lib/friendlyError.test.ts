import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES } from '@spm/shared';
import { ApiRequestError } from '../api/errors';
import {
  GOLDEN_CODES,
  friendlyError,
  friendlyStageError,
  isQuotaFailure,
  stageFailureReason,
} from './friendlyError';

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

describe('failed-stage errors', () => {
  const quota = { code: 'STAGE_FAILED', details: { code: 'QUOTA_EXHAUSTED', attempts: 1 } };

  it('shows the quota wording, with a sample plan, for QUOTA_EXHAUSTED', () => {
    expect(isQuotaFailure(quota)).toBe(true);
    const f = friendlyStageError(quota);
    expect(f.title).toBe('The free AI quota is used up right now');
    expect(f.offerGolden).toBe(true);
    expect(f.message).not.toMatch(/starting a new run/i);
    expect(GOLDEN_CODES.has('QUOTA_EXHAUSTED')).toBe(true);
  });

  it('keeps the generic stage-failure wording for other reasons', () => {
    const other = { code: 'STAGE_FAILED', details: { code: 'VALIDATION_FAILED' } };
    expect(isQuotaFailure(other)).toBe(false);
    expect(stageFailureReason(other)).toBe('VALIDATION_FAILED');
    expect(friendlyStageError(other).title).toBe('A planning stage failed');
    expect(friendlyStageError({ code: 'STAGE_FAILED', details: {} }).title).toBe(
      'A planning stage failed',
    );
    expect(friendlyStageError({ code: 'STAGE_FAILED' }).code).toBe('STAGE_FAILED');
  });
});
