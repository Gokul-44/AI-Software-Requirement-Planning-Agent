import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, PlanSchema, assertPlanIntegrity } from '@spm/shared';
import type { Config, Plan } from '@spm/shared';
import type { Repository } from '../db/repository.js';
import type { LlmClient } from '../llm/types.js';
import type { Pipeline } from '../pipeline/orchestrator.js';
import { PROMPT_VERSIONS } from '../prompts/index.js';

export interface RecordGoldenOptions {
  idea: string;
  repo: Repository;
  pipeline: Pipeline;
  llm: LlmClient;
  /** Normally apps/web/public/golden. Tests pass a temporary directory. */
  outDir: string;
  config?: Config;
}

export interface RecordedGolden {
  runId: string;
  file: string;
  plan: Plan;
}

/** "I want an online food delivery app" becomes "i-want-an-online-food-delivery-app". */
export function slugify(idea: string): string {
  const slug = idea
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'plan';
}

/**
 * Runs the whole pipeline for `idea`, writes the validated plan to `<outDir>/<slug>.json`, lists
 * it in `<outDir>/index.json` (the web app's demo list) and marks the run `is_golden`.
 * Nothing is written when the run does not finish with a plan.
 */
export async function recordGolden(opts: RecordGoldenOptions): Promise<RecordedGolden> {
  const { repo, pipeline, llm } = opts;
  const { runId } = await repo.createProjectWithRun({
    ideaText: opts.idea,
    config: opts.config ?? DEFAULT_CONFIG,
    llmProvider: llm.provider,
    llmModel: llm.model,
    promptVersions: Object.fromEntries(Object.entries(PROMPT_VERSIONS)),
  });
  await pipeline.execute(runId);
  const run = await repo.getRun(runId);
  if (run?.status !== 'succeeded' || run.plan === null || run.plan === undefined) {
    const why = run?.error ? `: ${run.error.message}` : '';
    throw new Error(`The run did not succeed (status ${run?.status ?? 'unknown'})${why}`);
  }
  const plan = PlanSchema.parse(run.plan);
  assertPlanIntegrity(plan);

  mkdirSync(opts.outDir, { recursive: true });
  const fileName = `${slugify(opts.idea)}.json`;
  const file = path.join(opts.outDir, fileName);
  writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  const indexPath = path.join(opts.outDir, 'index.json');
  let names: string[] = [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(indexPath, 'utf8'));
    if (Array.isArray(parsed)) names = parsed.filter((n): n is string => typeof n === 'string');
  } catch {
    // no index yet
  }
  if (!names.includes(fileName)) names.push(fileName);
  writeFileSync(indexPath, `${JSON.stringify(names)}\n`, 'utf8');

  await repo.markGolden(runId);
  return { runId, file, plan };
}
