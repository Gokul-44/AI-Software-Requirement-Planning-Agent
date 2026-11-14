import { ApiRequestError } from './errors';
import type { DemoGoldenItem, Plan, RunStatus } from './types';

/** The eight pipeline stages, in order (same names as the API's RunStatus). */
export const STAGE_NAMES = [
  'requirements',
  'stories',
  'tasks',
  'estimates',
  'dependencies',
  'schedule',
  'risks',
  'assemble',
] as const;

/**
 * Loads every plan listed in /golden/index.json (cached for the session). The golden plans are
 * static files shipped with the web app, so they work in fixture mode and as a fallback in live
 * mode when the server cannot run the pipeline.
 */
let goldenPromise: Promise<Plan[]> | null = null;
export function loadGolden(): Promise<Plan[]> {
  if (goldenPromise) return goldenPromise;
  const promise = (async () => {
    const indexRes = await fetch('/golden/index.json');
    if (!indexRes.ok) {
      throw new ApiRequestError(
        'NOT_FOUND',
        'The golden demo list (/golden/index.json) is missing.',
        404,
      );
    }
    const files = (await indexRes.json()) as string[];
    return Promise.all(
      files.map(async (file) => {
        const res = await fetch(`/golden/${file}`);
        if (!res.ok) {
          throw new ApiRequestError(
            'NOT_FOUND',
            `Golden plan ${file} could not be loaded.`,
            res.status,
          );
        }
        return (await res.json()) as Plan;
      }),
    );
  })();
  goldenPromise = promise;
  promise.catch(() => {
    if (goldenPromise === promise) goldenPromise = null; // allow a retry after a failure
  });
  return promise;
}

export async function listStaticGolden(): Promise<DemoGoldenItem[]> {
  const plans = await loadGolden();
  return plans.map((p) => ({ run_id: p.run.id, idea_text: p.project.idea_text }));
}

/** A golden plan has no live run: every stage reads as reused from the cache. */
export function goldenRunStatus(plan: Plan): RunStatus {
  return {
    run_id: plan.run.id,
    status: plan.run.status,
    current_stage: 8,
    stages: STAGE_NAMES.map((name, i) => ({
      stage: i + 1,
      name,
      status: 'cached' as const,
      attempts: 0,
      latency_ms: 0,
    })),
    issues_count: {
      error: plan.issues.filter((x) => x.severity === 'error').length,
      warning: plan.issues.filter((x) => x.severity === 'warning').length,
    },
    cycle: null,
    error: null,
  };
}
