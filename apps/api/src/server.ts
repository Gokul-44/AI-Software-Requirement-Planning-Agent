import { pino } from 'pino';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { PgRepository, createPool } from './db/pg-repository.js';
import { createHarness } from './llm/harness.js';
import { createLlmClient } from './llm/factory.js';
import { Pipeline } from './pipeline/orchestrator.js';

const config = loadConfig();
const logger = pino({
  level: config.LOG_LEVEL,
  // Never log secrets, even if a future change puts them in a logged object.
  redact: ['*.apiKey', '*.connectionString', 'req.headers.authorization', 'req.headers.cookie'],
});

if (!config.DATABASE_URL) {
  logger.fatal('DATABASE_URL is not set.');
  process.exit(1);
}

const pool = createPool({ connectionString: config.DATABASE_URL, max: config.DB_POOL_MAX });
pool.on('error', (err) => logger.error({ err }, 'idle database client error'));
const repo = new PgRepository(pool);
const llm = createLlmClient(config, repo.cache, logger);
const harness = createHarness({ llm, cache: repo.cache, logger });
const pipeline = new Pipeline({ repo, harness, logger });

await pipeline.recover();
const app = createApp({ config, repo, llm, pipeline, logger });
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, provider: llm.provider, model: llm.model }, 'api listening');
});

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'shutting down');
  server.close();
  // A run in progress is abandoned; startup recovery marks it INTERRUPTED next time.
  await pool.end().catch(() => undefined);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
