import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { API_PORT, WEB_PORT } from './ports.js';

/**
 * End-to-end smoke test (design document E4). It starts the whole stack itself with `npm run dev:mock`:
 * mock model and an in-memory store, so no real model is called and nothing touches the database.
 * Ports differ from the normal dev ports so a running dev server is never reused by mistake.
 * Not part of CI: run it with `npm run e2e`.
 */

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: path.resolve(import.meta.dirname, '..', '..', 'test-results'),
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    acceptDownloads: true,
    trace: 'retain-on-failure',
    // Normally the Chromium that `npx playwright install chromium` downloads. If that download
    // keeps failing, point E2E_CHROMIUM_PATH at any installed Chromium or Chrome executable.
    ...(process.env['E2E_CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['E2E_CHROMIUM_PATH'] } }
      : {}),
  },
  webServer: {
    command: 'npm run dev:mock',
    cwd: path.resolve(import.meta.dirname, '..', '..'),
    url: `http://localhost:${API_PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      API_PORT: String(API_PORT),
      WEB_PORT: String(WEB_PORT),
      // Defence in depth: whatever apps/api/.env holds, this stack has no model key and no database.
      LLM_PROVIDER: 'mock',
      USE_MEMORY_DB: 'true',
      LLM_MIN_INTERVAL_MS: '0',
      GEMINI_API_KEY: '',
      DATABASE_URL: '',
      DATABASE_URL_UNPOOLED: '',
    },
  },
});
