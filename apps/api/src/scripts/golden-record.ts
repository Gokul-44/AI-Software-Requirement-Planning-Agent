import path from 'node:path';
import { pino } from 'pino';
import { loadConfig } from '../config.js';
import { PgRepository, createPool } from '../db/pg-repository.js';
import { createLlmClient } from '../llm/factory.js';
import { createHarness } from '../llm/harness.js';
import { Pipeline } from '../pipeline/orchestrator.js';
import { recordGolden } from './golden.js';

/**
 * Records one golden demo plan:
 *   npm run golden:record -- "I want an online food delivery app"
 * Runs the full pipeline with the configured provider, stores the run in the database, writes the
 * plan to apps/web/public/golden/<slug>.json and marks the run is_golden. Never prints secrets.
 */
const idea = process.argv.slice(2).join(' ').trim();
if (idea.length < 10) {
  console.error('Usage: npm run golden:record -- "<idea of at least 10 characters>"');
  process.exit(1);
}

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
if (!config.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

const pool = createPool({ connectionString: config.DATABASE_URL, max: 3 });
pool.on('error', (err) => logger.error({ err }, 'idle database client error'));
try {
  const repo = new PgRepository(pool);
  const llm = createLlmClient(config, repo.cache, logger);
  const pipeline = new Pipeline({
    repo,
    harness: createHarness({ llm, cache: repo.cache, logger }),
    logger,
  });
  const outDir = path.resolve(import.meta.dirname, '..', '..', '..', 'web', 'public', 'golden');
  console.log(`provider=${llm.provider} model=${llm.model}`);
  const result = await recordGolden({ idea, repo, pipeline, llm, outDir });
  console.log(
    `run ${result.runId} recorded as golden: ${path.relative(process.cwd(), result.file)}`,
  );
} finally {
  await pool.end();
}
