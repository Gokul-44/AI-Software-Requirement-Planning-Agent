import { z } from 'zod';

/** An env var that is set to the empty string counts as unset (so `.env` templates stay valid). */
const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().optional(),
);

const optionalInt = (def: number, min = 0) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number().int().min(min).default(def),
  );

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: optionalInt(3001, 1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Pooled Neon connection string (the running API). Never logged. */
  DATABASE_URL: optionalString,
  /** Direct connection string, used by migrations only. Never logged. */
  DATABASE_URL_UNPOOLED: optionalString,
  DB_POOL_MAX: optionalInt(5, 1),
  LLM_PROVIDER: z.enum(['gemini', 'mock', 'replay']).default('mock'),
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: optionalString,
  GEMINI_THINKING: z.enum(['minimal', 'low', 'medium', 'high']).default('low'),
  GEMINI_TIMEOUT_MS: optionalInt(360_000, 1000),
  /** Minimum gap between two LLM calls: 60000 / free-tier RPM, rounded up with some margin. */
  LLM_MIN_INTERVAL_MS: optionalInt(6500),
  /** Provider and model that recorded the stage_cache entries the replay provider serves. */
  REPLAY_SOURCE_PROVIDER: optionalString,
  REPLAY_SOURCE_MODEL: optionalString,
  MAX_CONCURRENT_RUNS: optionalInt(2, 1),
  DAILY_RUN_CAP: optionalInt(20),
  RATE_LIMIT_RUNS_PER_HOUR: optionalInt(5),
  DEMO_ACCESS_CODE: optionalString,
  /** Comma separated list of allowed origins. Empty: no CORS headers. */
  CORS_ORIGIN: optionalString,
});

export type AppConfig = z.infer<typeof EnvSchema> & { version: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // Only variable names and problems are reported, never values.
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment: ${problems.join('; ')}`);
  }
  return { ...parsed.data, version: process.env['npm_package_version'] ?? '0.0.0' };
}

/** True when the selected provider has everything it needs to make calls. */
export function llmConfigured(config: AppConfig): boolean {
  if (config.LLM_PROVIDER === 'gemini') {
    return config.GEMINI_API_KEY !== undefined && config.GEMINI_MODEL !== undefined;
  }
  return true;
}
