import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pino } from 'pino';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { MemoryRepository } from '../db/memory-repository.js';
import { PgRepository, createPool } from '../db/pg-repository.js';
import type { Repository } from '../db/repository.js';
import { resultsFromCsv, toCsv, toMarkdown } from '../eval/report.js';
import type { ReportContext } from '../eval/report.js';
import { planRuns, runEval } from '../eval/runner.js';
import type { EvalRunResult } from '../eval/runner.js';
import { createLlmClient } from '../llm/factory.js';
import { createHarness } from '../llm/harness.js';
import { PROMPT_VERSIONS } from '../prompts/index.js';

/**
 * LLM evaluation (design document E3): runs the fixed ideas in eval/ideas.json through the real
 * pipeline with the configured provider (cache off) and writes eval/results/<date>_<model>.csv
 * and .md with every automatic metric. Usage:
 *   npm run eval -- --limit 5 --repeat-first 3
 *     --limit N          the first N ideas of eval/ideas.json (default: all)
 *     --ids 2,4,5        pick ideas by id instead (overrides --limit)
 *     --repeat-first K   run the first selected idea K times in total, after all ideas ran once
 *     --tag name         add _name to the result file names
 *     --memory           keep runs in memory (nothing is written to the database)
 *     --report-from a.csv,b.csv  no model call: merge result CSVs into one .csv and .md
 *     --note "text"     add a note under the title of the .md (repeatable)
 * Runs are stored in the database like any run (the CSV lists the run ids). The script stops at
 * the first quota error and says so in the .md. Never prints secrets.
 */
const IdeasFile = z.array(
  z.object({
    id: z.number().int().positive(),
    slug: z.string().min(1),
    idea: z.string().min(10),
    note: z.string().optional(),
  }),
);

function flag(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(name);
  if (i >= 0) return argv[i + 1];
  return argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
}
const hasFlag = (name: string) => process.argv.slice(2).includes(name);

function intFlag(name: string, fallback: number): number {
  const raw = flag(name);
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer.`);
  return n;
}

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const ideasPath = path.join(repoRoot, 'eval', 'ideas.json');
const ideas = IdeasFile.parse(JSON.parse(readFileSync(ideasPath, 'utf8')));
const limit = intFlag('--limit', ideas.length);
const repeatFirst = intFlag('--repeat-first', 1);
const idList = flag('--ids');
const chosen = idList
  ? idList.split(',').map((s) => {
      const found = ideas.find((i) => i.id === Number.parseInt(s, 10));
      if (!found) throw new Error(`No idea with id ${s} in eval/ideas.json.`);
      return found;
    })
  : ideas;
const planned = planRuns(chosen, { limit: idList ? chosen.length : limit, repeatFirst });

const config = loadConfig();
const notes = process.argv
  .slice(2)
  .flatMap((a, i, all) =>
    a === '--note' && all[i + 1] !== undefined ? [all[i + 1] as string] : [],
  );
const reportFrom = flag('--report-from');
if (reportFrom) {
  // No model call: merge the measured runs of several result files into one report.
  const merged = reportFrom
    .split(',')
    .flatMap((file) => resultsFromCsv(readFileSync(path.resolve(file.trim()), 'utf8')));
  const model = config.GEMINI_MODEL ?? 'unknown-model';
  const mergedDate = new Date().toLocaleDateString('sv-SE');
  const mergedTag = flag('--tag') ?? 'merged';
  const mergedBase = path.join(repoRoot, 'eval', 'results', `${mergedDate}_${model}_${mergedTag}`);
  mkdirSync(path.dirname(mergedBase), { recursive: true });
  writeFileSync(`${mergedBase}.csv`, toCsv(merged), 'utf8');
  writeFileSync(
    `${mergedBase}.md`,
    toMarkdown(merged, {
      date: mergedDate,
      provider: config.LLM_PROVIDER,
      model,
      minIntervalMs: config.LLM_MIN_INTERVAL_MS,
      promptVersions: Object.fromEntries(Object.entries(PROMPT_VERSIONS)),
      stopReason: 'done',
      notRun: [],
      requested: null,
      notes,
    }),
    'utf8',
  );
  console.log(`merged ${merged.length} run(s) into ${path.relative(repoRoot, mergedBase)}.*`);
  process.exit(0);
}
const logger = pino({ level: config.LOG_LEVEL === 'info' ? 'warn' : config.LOG_LEVEL });
const useMemory = hasFlag('--memory');
let pool: ReturnType<typeof createPool> | null = null;
let repo: Repository;
if (useMemory) {
  repo = new MemoryRepository();
} else {
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL is not set (or pass --memory).');
  pool = createPool({ connectionString: config.DATABASE_URL, max: 3 });
  pool.on('error', (err) => logger.error({ err }, 'idle database client error'));
  repo = new PgRepository(pool);
}

const llm = createLlmClient(config, repo.cache, logger);
const date = new Date().toLocaleDateString('sv-SE');
const safeModel = llm.model.replace(/[^A-Za-z0-9._-]+/g, '-');
const tag = flag('--tag');
const base = path.join(repoRoot, 'eval', 'results', `${date}_${safeModel}${tag ? `_${tag}` : ''}`);
mkdirSync(path.dirname(base), { recursive: true });

const context = (
  stopReason: ReportContext['stopReason'],
  notRun: ReportContext['notRun'],
): ReportContext => ({
  date,
  provider: llm.provider,
  model: llm.model,
  minIntervalMs: config.LLM_MIN_INTERVAL_MS,
  promptVersions: Object.fromEntries(Object.entries(PROMPT_VERSIONS)),
  stopReason,
  notRun,
  requested: { limit: idList ? chosen.length : limit, repeatFirst },
  notes,
});

const results: EvalRunResult[] = [];
function write(stopReason: ReportContext['stopReason'], notRun: ReportContext['notRun']): void {
  writeFileSync(`${base}.csv`, toCsv(results), 'utf8');
  writeFileSync(`${base}.md`, toMarkdown(results, context(stopReason, notRun)), 'utf8');
}

console.log(
  `provider=${llm.provider} model=${llm.model} minIntervalMs=${config.LLM_MIN_INTERVAL_MS} maxRetries=${config.LLM_MAX_RETRIES} store=${useMemory ? 'memory' : 'database'}`,
);
console.log(`${planned.length} run(s) planned; results go to ${path.relative(repoRoot, base)}.*`);

try {
  const outcome = await runEval({
    repo,
    llm,
    harness: createHarness({ llm, cache: repo.cache, logger }),
    logger,
    planned,
    onStart: (run, index, total) =>
      console.log(
        `[${index + 1}/${total}] idea ${run.idea.id} "${run.idea.idea}" repeat ${run.repeat}`,
      ),
    onResult: (result) => {
      results.push(result);
      const m = result.metrics;
      console.log(
        `  run ${result.runId} ${m.status}${m.failureCode ? ` (${m.failureCode}, stage ${m.failedStage})` : ''}: calls=${m.calls} firstTry=${m.callsFirstTryValid} retries=${m.repairRetries} tasks=${m.tasks ?? '-'} time=${m.runSeconds.toFixed(1)}s`,
      );
      write('in_progress', []);
    },
  });
  write(outcome.stopReason, outcome.notRun);
  console.log(`stop reason: ${outcome.stopReason}; ${outcome.notRun.length} run(s) not made`);
} finally {
  await pool?.end();
}
