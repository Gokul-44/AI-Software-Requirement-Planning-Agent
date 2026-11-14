import { EstimatesOutputSchema } from '@spm/shared';
import type { Config, Points } from '@spm/shared';
import type { EstimateRow, IssueDraft, StoryRow, TaskRow } from '../db/repository.js';
import { PROMPT_VERSIONS, stage4System, stage4User } from '../prompts/index.js';
import type { Stage4Input } from './inputs.js';
import { bestEffort, chunk, clip, tracked } from './support.js';
import type { StageContext } from './support.js';

/**
 * One call per batch keeps each Gemini answer short (the free tier is slow), and a batch that
 * misses a task only costs that batch.
 */
export const ESTIMATE_BATCH_SIZE = 40;
/** A task the model never estimated gets this value, and a warning says so. */
export const DEFAULT_POINTS: Points = 3;
const MAX_UNKNOWN_ISSUES = 10;
const MAX_OUTPUT_TOKENS = 8192;

export interface EstimationResult {
  rows: EstimateRow[];
  issues: IssueDraft[];
}

const brief = (t: TaskRow, stories: Map<string, StoryRow>) => ({
  id: t.code,
  title: t.title,
  layer: t.layer,
  story: clip(stories.get(t.storyCode)?.iWant ?? '', 120),
});

/**
 * Stage 4 (design document B3.3): exactly one estimate per task. Unknown ids are dropped and logged,
 * missing tasks get one targeted retry, and a task that is still missing gets a default estimate
 * with a warning. Hours always come from `config.points_to_hours`, never from the model.
 */
export async function estimateTasks(
  ctx: StageContext,
  tasks: TaskRow[],
  stories: StoryRow[],
  pointsToHours: Config['points_to_hours'],
): Promise<EstimationResult> {
  const storyByCode = new Map(stories.map((s) => [s.code, s]));
  const known = new Set(tasks.map((t) => t.code));
  const got = new Map<string, { points: Points; rationale: string }>();
  const unknown = new Set<string>();

  const ask = async (batch: TaskRow[], schemaName: string) => {
    const input: Stage4Input = { tasks: batch.map((t) => brief(t, storyByCode)) };
    const result = await tracked(ctx, {
      stage: 4,
      promptVersion: PROMPT_VERSIONS[4],
      system: stage4System(),
      user: stage4User(input),
      input,
      schema: EstimatesOutputSchema,
      schemaName,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
    for (const e of result.value.estimates) {
      if (!known.has(e.task_id)) unknown.add(e.task_id);
      else if (!got.has(e.task_id))
        got.set(e.task_id, { points: e.points, rationale: e.rationale });
    }
  };

  for (const batch of chunk(tasks, ESTIMATE_BATCH_SIZE)) await ask(batch, 'Estimates');

  // Exact coverage: one targeted retry with only the tasks that have no estimate.
  let missing = tasks.filter((t) => !got.has(t.code));
  if (missing.length > 0) {
    ctx.logger.info({ missing: missing.map((t) => t.code) }, 'stage 4 coverage failed, one retry');
    await bestEffort(ctx, () => ask(missing, 'EstimatesMissing'));
    missing = tasks.filter((t) => !got.has(t.code));
  }

  const issues: IssueDraft[] = [];
  for (const id of [...unknown].slice(0, MAX_UNKNOWN_ISSUES)) {
    issues.push({
      stage: 4,
      severity: 'warning',
      kind: 'unknown_reference',
      message: `Estimate for "${id}" dropped: it is not a task.`,
      refs: [id],
      resolution: 'Estimate removed.',
    });
  }
  for (const t of missing) {
    issues.push({
      stage: 4,
      severity: 'warning',
      kind: 'missing_estimate',
      message: `${t.code} got no estimate from the model, even after one targeted retry. ${DEFAULT_POINTS} points were assumed.`,
      refs: [t.code],
      resolution: `Default estimate of ${DEFAULT_POINTS} points.`,
    });
  }

  const rows: EstimateRow[] = tasks.map((t) => {
    const e = got.get(t.code) ?? {
      points: DEFAULT_POINTS,
      rationale: 'Default estimate: the model returned none.',
    };
    return {
      code: t.code,
      points: e.points,
      hours: pointsToHours[String(e.points) as keyof typeof pointsToHours],
      rationale: e.rationale,
    };
  });
  for (const r of rows) {
    if (r.points !== 13) continue;
    issues.push({
      stage: 4,
      severity: 'warning',
      kind: 'oversized_task',
      message: `${r.code} is estimated at 13 points. It is too big and should be split.`,
      refs: [r.code],
      resolution: null,
    });
  }
  return { rows, issues };
}
