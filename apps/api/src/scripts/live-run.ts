import { pino } from 'pino';
import { DEFAULT_CONFIG, PlanSchema } from '@spm/shared';
import { loadConfig } from '../config.js';
import { PgRepository, createPool } from '../db/pg-repository.js';
import { createLlmClient } from '../llm/factory.js';
import { createHarness } from '../llm/harness.js';
import { Pipeline } from '../pipeline/orchestrator.js';
import { PROMPT_VERSIONS } from '../prompts/index.js';
import { readIdea } from './idea.js';

/**
 * One full run (stages 1-8) with the configured provider, stored in the database.
 * Usage (the idea never comes from shell-split arguments, see scripts/idea.ts):
 *   npm run live-run -w @spm/api -- --idea-file idea.txt      (safest on Windows)
 *   npm run live-run -w @spm/api -- --idea "I want an online food delivery app"
 *   IDEA="I want an online food delivery app" npm run live-run -w @spm/api
 * With no idea it runs "I want an online food delivery app".
 * Prints counts, attempts and time per stage, then the plan numbers. Never prints keys or
 * connection strings.
 */
const idea =
  readIdea({ argv: process.argv.slice(2), env: process.env }) ??
  'I want an online food delivery app';
const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
if (!config.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

const pool = createPool({ connectionString: config.DATABASE_URL, max: 3 });
pool.on('error', (err) => logger.error({ err }, 'idle database client error'));
const repo = new PgRepository(pool);
const llm = createLlmClient(config, repo.cache, logger);
const pipeline = new Pipeline({
  repo,
  harness: createHarness({ llm, cache: repo.cache, logger }),
  logger,
});

const { runId } = await repo.createProjectWithRun({
  ideaText: idea,
  config: DEFAULT_CONFIG,
  llmProvider: llm.provider,
  llmModel: llm.model,
  promptVersions: Object.fromEntries(Object.entries(PROMPT_VERSIONS)),
});
console.log(
  `provider=${llm.provider} model=${llm.model} minIntervalMs=${config.LLM_MIN_INTERVAL_MS}`,
);
const started = Date.now();
await pipeline.execute(runId);
const totalMs = Date.now() - started;

const run = await repo.getRun(runId);
const core = await repo.loadCore(runId);
const stages = await repo.getStages(runId);
console.log(`run ${runId} status=${run?.status}`);
if (run?.error) console.log('error:', JSON.stringify(run.error));
console.log(
  `counts: requirements=${core.requirements.length} epics=${core.epics.length} stories=${core.stories.length} tasks=${core.tasks.length} edges=${core.dependencies.length} issues=${core.issues.length}`,
);
for (const s of stages) {
  console.log(
    `stage ${s.stage}: status=${s.status} attempts=${s.attempts} time=${((s.latencyMs ?? 0) / 1000).toFixed(1)}s tokens_in=${s.inputTokens} tokens_out=${s.outputTokens}`,
  );
}
if (run?.cycle) console.log(`cycle waiting: ${JSON.stringify(run.cycle)}`);
const parsed = PlanSchema.safeParse(run?.plan);
if (parsed.success) {
  const plan = parsed.data;
  const count = (kind: string) => plan.issues.filter((i) => i.kind === kind).length;
  console.log(
    `plan: tasks=${plan.tasks.length} edges=${plan.dependencies.length} critical_tasks=${plan.schedule.tasks.filter((t) => t.critical).length} cpm_days=${plan.schedule.cpm.duration_days} cpm_hours=${plan.schedule.cpm.duration_hours} sprints=${plan.schedule.capacity_plan.sprint_count} capacity_days=${plan.schedule.capacity_plan.duration_days}`,
  );
  console.log(
    `signals=${plan.signals.length} risks=${plan.risks.length} (template=${plan.risks.filter((r) => r.origin === 'template').length}) issues=${plan.issues.length} cycles_repaired=${count('cycle_repaired')} suspicious_edges=${count('suspicious_edge')} unknown_refs=${count('unknown_reference')} risk_rejected=${count('risk_rejected')}`,
  );
}
console.log(
  `total: ${(totalMs / 1000).toFixed(1)}s tokens_in=${run?.inputTokens} tokens_out=${run?.outputTokens}`,
);
for (const i of core.issues) console.log(`issue ${i.code} ${i.kind} ${i.severity}: ${i.message}`);
await pool.end();
