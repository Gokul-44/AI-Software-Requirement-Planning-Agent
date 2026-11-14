import { StageCallError } from '../llm/harness.js';
import type { Harness, StageCallResult, StageCallSpec } from '../llm/harness.js';
import { countInvalidRefs, isInfraCode } from './metrics.js';
import type { CallRecord } from './metrics.js';

/** How many references one model answer proposes, for the call types that carry references. */
function proposedRefs(schemaName: string, value: unknown): number {
  const v = value as {
    epics?: { stories?: { requirement_ids?: unknown[] }[] }[];
    stories?: { requirement_ids?: unknown[] }[];
    tasks?: unknown[];
  };
  switch (schemaName) {
    case 'Stories':
      return (v.epics ?? []).reduce(
        (a, e) => a + (e.stories ?? []).reduce((b, s) => b + (s.requirement_ids?.length ?? 0), 0),
        0,
      );
    case 'CoverageStories':
      // Each story names its requirements and one epic.
      return (v.stories ?? []).reduce((a, s) => a + (s.requirement_ids?.length ?? 0) + 1, 0);
    case 'Tasks':
      // Each task names its story.
      return v.tasks?.length ?? 0;
    default:
      return 0;
  }
}

/**
 * Wraps a harness for the evaluation: the cache is switched off (E3 protocol: one fresh run per
 * idea) and every call is recorded. Semantic checks are observed, never changed, so the pipeline
 * behaves exactly as in production.
 */
export class RecordingHarness implements Harness {
  readonly calls: CallRecord[] = [];

  constructor(private readonly inner: Harness) {}

  reset(): void {
    this.calls.length = 0;
  }

  async callStage<T>(spec: StageCallSpec<T>): Promise<StageCallResult<T>> {
    let refsProposed = 0;
    let refsInvalid = 0;
    const semantic = spec.semantic;
    const observed: StageCallSpec<T> = {
      ...spec,
      bypassCache: true,
      ...(semantic
        ? {
            semantic: (value: T) => {
              const errors = semantic(value);
              refsProposed += proposedRefs(spec.schemaName, value);
              refsInvalid += countInvalidRefs(errors);
              return errors;
            },
          }
        : {}),
    };
    try {
      const result = await this.inner.callStage(observed);
      this.calls.push({
        stage: spec.stage,
        schemaName: spec.schemaName,
        attempts: result.attempts,
        outcome: 'ok',
        failureCode: null,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        refsProposed,
        refsInvalid,
      });
      return result;
    } catch (err) {
      if (err instanceof StageCallError) {
        this.calls.push({
          stage: spec.stage,
          schemaName: spec.schemaName,
          attempts: err.info.attempts,
          outcome: isInfraCode(err.code) ? 'infra' : 'invalid',
          failureCode: err.code,
          inputTokens: err.info.usage.inputTokens,
          outputTokens: err.info.usage.outputTokens,
          refsProposed,
          refsInvalid,
        });
      }
      throw err;
    }
  }
}
