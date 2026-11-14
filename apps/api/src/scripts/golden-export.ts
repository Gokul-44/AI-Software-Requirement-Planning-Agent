import path from 'node:path';
import { pino } from 'pino';
import { loadConfig } from '../config.js';
import { PgRepository, createPool } from '../db/pg-repository.js';
import { exportGolden } from './golden.js';

/**
 * Exports a stored real run as a golden demo plan (no model call):
 *   npm run golden:export -- <run_id> <slug> [--no-mark]
 * Reads runs.plan, checks it, writes apps/web/public/golden/<slug>.json, lists it first in
 * index.json and marks the run is_golden (the only database write; --no-mark skips it).
 * Never prints secrets.
 */
const args = process.argv.slice(2);
const mark = !args.includes('--no-mark');
const [runId, slug] = args.filter((a) => !a.startsWith('--'));
if (!runId || !slug) {
  console.error('Usage: npm run golden:export -- <run_id> <slug> [--no-mark]');
  process.exit(1);
}

const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
if (!config.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

const pool = createPool({ connectionString: config.DATABASE_URL, max: 2 });
pool.on('error', (err) => logger.error({ err }, 'idle database client error'));
try {
  const repo = new PgRepository(pool);
  const outDir = path.resolve(import.meta.dirname, '..', '..', '..', 'web', 'public', 'golden');
  const result = await exportGolden({ repo, runId, slug, outDir, mark });
  console.log(
    `run ${runId} exported: ${path.relative(process.cwd(), result.file)} ` +
      `(is_golden ${result.marked ? 'set' : 'not changed'})`,
  );
} finally {
  await pool.end();
}
