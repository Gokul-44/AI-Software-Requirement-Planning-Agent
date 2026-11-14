import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, PlanSchema, assertPlanIntegrity } from '@spm/shared';
import type { Config, Plan } from '@spm/shared';
import type { Repository } from '../db/repository.js';
import type { LlmClient } from '../llm/types.js';
import type { Pipeline } from '../pipeline/orchestrator.js';
import { PROMPT_VERSIONS } from '../prompts/index.js';
import { stripCmdCarets } from './idea.js';

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
 * Writes a validated plan to `<outDir>/<slug>.json` and lists the file in `<outDir>/index.json`
 * (the web app's demo list). `first` puts it at the top of the list. Used by `recordGolden` and by
 * `npm run golden:export`.
 */
export function writeGolden(
  plan: Plan,
  slug: string,
  outDir: string,
  options: { first?: boolean } = {},
): { file: string; fileName: string } {
  mkdirSync(outDir, { recursive: true });
  const fileName = `${slug}.json`;
  const file = path.join(outDir, fileName);
  writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  const indexPath = path.join(outDir, 'index.json');
  let names: string[] = [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(indexPath, 'utf8'));
    if (Array.isArray(parsed)) names = parsed.filter((n): n is string => typeof n === 'string');
  } catch {
    // no index yet
  }
  names = names.filter((n) => n !== fileName);
  if (options.first) names.unshift(fileName);
  else names.push(fileName);
  writeFileSync(indexPath, `${JSON.stringify(names)}\n`, 'utf8');
  return { file, fileName };
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

  const { file } = writeGolden(plan, slugify(opts.idea), opts.outDir);

  await repo.markGolden(runId);
  return { runId, file, plan };
}

export interface ExportGoldenOptions {
  repo: Repository;
  runId: string;
  slug: string;
  /** Normally apps/web/public/golden. Tests pass a temporary directory. */
  outDir: string;
  /** Mark the run `is_golden` in the database (the only write; default true). */
  mark?: boolean;
}

export interface ExportedGolden {
  file: string;
  plan: Plan;
  marked: boolean;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;

/**
 * Writes a stored, succeeded run to `<outDir>/<slug>.json` and lists it first in `index.json`.
 * It only READS the run (no model call), checks the plan with PlanSchema and assertPlanIntegrity,
 * and cleans the idea text. Marking the run `is_golden` is the single optional write.
 */
export async function exportGolden(opts: ExportGoldenOptions): Promise<ExportedGolden> {
  if (!SLUG.test(opts.slug)) {
    throw new Error(
      'The slug must be lowercase letters, digits and dashes, for example food-delivery-gemini.',
    );
  }
  const run = await opts.repo.getRun(opts.runId);
  if (!run) throw new Error(`Run ${opts.runId} does not exist.`);
  if (run.status !== 'succeeded' || run.plan === null || run.plan === undefined) {
    throw new Error(`Run ${opts.runId} has no finished plan (status ${run.status}).`);
  }
  const parsed = PlanSchema.parse(run.plan);
  const plan: Plan = {
    ...parsed,
    project: {
      ...parsed.project,
      idea_text: stripCmdCarets(parsed.project.idea_text).replace(/\s+/g, ' ').trim(),
    },
  };
  assertPlanIntegrity(PlanSchema.parse(plan));

  const { file } = writeGolden(plan, opts.slug, opts.outDir, { first: true });
  const mark = opts.mark ?? true;
  if (mark) await opts.repo.markGolden(opts.runId);
  return { file, plan, marked: mark };
}
