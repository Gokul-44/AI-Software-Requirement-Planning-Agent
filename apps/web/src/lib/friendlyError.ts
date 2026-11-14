import { ApiRequestError } from '../api/errors';

export interface FriendlyError {
  title: string;
  message: string;
  /** True when "Open a golden demo plan" is a useful way out (limits, no model, server down). */
  offerGolden: boolean;
  code: string | null;
}

/** Codes after which a recorded demo plan is the sensible thing to offer. */
export const GOLDEN_CODES = new Set([
  'RATE_LIMITED',
  'TOO_MANY_RUNS',
  'BUDGET_EXHAUSTED',
  'LLM_UNAVAILABLE',
  'QUOTA_EXHAUSTED',
  'NETWORK',
]);

const BY_CODE: Record<string, Omit<FriendlyError, 'code'>> = {
  VALIDATION_FAILED: {
    title: 'Please check your input',
    message:
      'The server could not accept the request. Make sure the idea is between 10 and 2000 characters and try again.',
    offerGolden: false,
  },
  INVALID_CONFIG: {
    title: 'These team settings do not fit together',
    message:
      'A sprint must be able to hold the largest task: team size times velocity must be at least 13 points, and the sprint hours must cover a 13-point task. Adjust the settings and try again.',
    offerGolden: false,
  },
  ACCESS_CODE_REQUIRED: {
    title: 'An access code is needed',
    message:
      'This server asks for an access code before it starts a live run. Enter it under "Team and sprint settings" and try again.',
    offerGolden: false,
  },
  NOT_FOUND: {
    title: 'We could not find that',
    message:
      'The run or plan does not exist, or the link is out of date. Go back to the home page or open a demo plan.',
    offerGolden: false,
  },
  RUN_NOT_READY: {
    title: 'This plan is not ready yet',
    message: 'The run is still working. Its progress page will open the plan when it finishes.',
    offerGolden: false,
  },
  INVALID_STATE: {
    title: 'That action is not available right now',
    message:
      'The run is in a state where this cannot be done, for example it is still running or already finished. Refresh the page and try again.',
    offerGolden: false,
  },
  RATE_LIMITED: {
    title: 'You have started a lot of runs',
    message:
      'To protect the free language-model quota, each visitor can start only a few runs per hour. Try again later, or open a demo plan to explore the product right now.',
    offerGolden: true,
  },
  TOO_MANY_RUNS: {
    title: 'The planner is busy',
    message:
      'Other runs are in progress and the server takes only a couple at a time. Try again in a minute, or open a demo plan meanwhile.',
    offerGolden: true,
  },
  BUDGET_EXHAUSTED: {
    title: 'The daily live-run limit is reached',
    message:
      'Live runs are capped per day to protect the free language-model quota. The limit resets tomorrow. Open a demo plan to see exactly what a finished run looks like.',
    offerGolden: true,
  },
  LLM_UNAVAILABLE: {
    title: 'The language model is unavailable',
    message:
      'The AI service is not reachable or not configured on this server, so a new plan cannot be generated now. Open a demo plan, or try again later.',
    offerGolden: true,
  },
  INTERNAL: {
    title: 'Something went wrong on our side',
    message:
      'The server hit an unexpected error. Try again in a moment; if it keeps happening, share the request id below with the team.',
    offerGolden: false,
  },
  QUOTA_EXHAUSTED: {
    title: 'The free AI quota is used up right now',
    message:
      'The free language-model quota is used up (or rate-limited) right now, so this stage could not run. Everything finished before it is saved. Retry from the failed stage in a little while, or open a sample plan to see a finished plan now.',
    offerGolden: true,
  },
  STAGE_FAILED: {
    title: 'A planning stage failed',
    message:
      'The model could not produce a valid result for this stage after several attempts. Retrying from this stage keeps the finished stages and usually fixes it.',
    offerGolden: true,
  },
  NETWORK: {
    title: 'Cannot reach the server',
    message:
      'The planning server did not answer. Check that it is running and your connection is up, or open a demo plan, which needs no server.',
    offerGolden: true,
  },
};

const FALLBACK: Omit<FriendlyError, 'code'> = {
  title: 'Something went wrong',
  message: 'The request failed. Try again in a moment.',
  offerGolden: false,
};

/** Maps any error (the C3 codes, network failures, stage failures) to friendly wording. */
export function friendlyError(error: unknown): FriendlyError {
  if (error instanceof ApiRequestError) {
    const known = BY_CODE[error.code];
    return { ...(known ?? FALLBACK), code: error.code };
  }
  return { ...FALLBACK, code: null };
}

export function friendlyCode(code: string): FriendlyError {
  return { ...(BY_CODE[code] ?? FALLBACK), code };
}

/** A failed run's error as the status endpoint reports it (`code` is always STAGE_FAILED). */
export interface StageErrorLike {
  code: string;
  details?: Record<string, unknown> | undefined;
}

/** The finer reason of a failed stage: `details.code` (for example QUOTA_EXHAUSTED), if any. */
export function stageFailureReason(error: StageErrorLike): string {
  const detail = error.details?.['code'];
  return typeof detail === 'string' ? detail : error.code;
}

/** True when the stage failed because the free model quota or rate limit is used up. */
export function isQuotaFailure(error: StageErrorLike): boolean {
  return stageFailureReason(error) === 'QUOTA_EXHAUSTED';
}

/** Friendly wording for a failed stage: the quota message for quota failures, else by code. */
export function friendlyStageError(error: StageErrorLike): FriendlyError {
  return friendlyCode(isQuotaFailure(error) ? 'QUOTA_EXHAUSTED' : error.code);
}
