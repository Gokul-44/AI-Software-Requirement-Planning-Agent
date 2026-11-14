// Starts the API and the web app together: `npm run dev` (or `npm run dev:mock`).
//
//   npm run dev        API with the settings from apps/api/.env, web in live mode
//   npm run dev:mock   API with LLM_PROVIDER=mock and an in-memory store (no database, no model)
//
// The web app talks to the API at http://localhost:<API_PORT>/api, and the API allows the web
// origin through CORS_ORIGIN. Press Ctrl+C once to stop both.
import { spawn } from 'node:child_process';

const mock = process.argv.includes('--mock');
const apiPort = process.env.API_PORT ?? '3001';
const webPort = process.env.WEB_PORT ?? '5173';

const apiEnv = {
  ...process.env,
  PORT: apiPort,
  CORS_ORIGIN: process.env.CORS_ORIGIN || `http://localhost:${webPort}`,
  ...(mock ? { LLM_PROVIDER: 'mock', USE_MEMORY_DB: 'true' } : {}),
};
const webEnv = {
  ...process.env,
  VITE_API_BASE_URL: `http://localhost:${apiPort}/api`,
  VITE_USE_FIXTURE: 'false',
};

const children = [];
let stopping = false;

function start(name, args, env) {
  const child = spawn('npm', args, { env, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (stream, out) => {
    let pending = '';
    stream.on('data', (chunk) => {
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) out.write(`[${name}] ${line}\n`);
    });
  };
  prefix(child.stdout, process.stdout);
  prefix(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`[${name}] exited with code ${code}; stopping the other process.`);
      stop(code ?? 1);
    }
  });
  children.push(child);
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

console.log(
  `Starting API on http://localhost:${apiPort} and web on http://localhost:${webPort}` +
    (mock ? ' (mock model, in-memory store)' : ''),
);
start('api', ['run', 'dev', '-w', '@spm/api'], apiEnv);
start('web', ['run', 'dev', '-w', '@spm/web', '--', '--port', webPort, '--strictPort'], webEnv);
