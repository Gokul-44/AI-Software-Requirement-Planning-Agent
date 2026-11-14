import { pino } from 'pino';
import { DEFAULT_CONFIG } from '@spm/shared';
import { loadConfig } from '../config.js';
import { PgRepository, createPool } from '../db/pg-repository.js';
import { createLlmClient } from '../llm/factory.js';
import { createHarness } from '../llm/harness.js';
import { Pipeline } from '../pipeline/orchestrator.js';
import { PROMPT_VERSIONS } from '../prompts/index.js';

/**
 * One real run of stages 1-3 with the configured provider, stored in the database.
 * Usage: npm run live-run -w @spm/api -- "I want an online food delivery app"
 * Prints counts, attempts and time per stage. Never prints keys or connection strings.
 */
const idea = process.argv[2] ?? 'I want an online food delivery app';
const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
if (!config.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

const pool = createPool({ connectionString: config.DATABASE_URL, max: 3 });
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
const stages = (await repo.getStages(runId)).slice(0, 3);
console.log(`run ${runId} status=${run?.status}`);
if (run?.error) console.log('error:', JSON.stringify(run.error));
console.log(
  `counts: requirements=${core.requirements.length} epics=${core.epics.length} stories=${core.stories.length} tasks=${core.tasks.length} issues=${core.issues.length}`,
);
for (const s of stages) {
  console.log(
    `stage ${s.stage}: status=${s.status} attempts=${s.attempts} time=${((s.latencyMs ?? 0) / 1000).toFixed(1)}s tokens_in=${s.inputTokens} tokens_out=${s.outputTokens}`,
  );
}
console.log(
  `total: ${(totalMs / 1000).toFixed(1)}s tokens_in=${run?.inputTokens} tokens_out=${run?.outputTokens}`,
);
for (const i of core.issues) console.log(`issue ${i.code} ${i.kind} ${i.severity}: ${i.message}`);
await pool.end();
