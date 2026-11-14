# Local setup

How to run the website and the API on your own computer, with or without a real AI model.

## Prerequisites

| Tool    | Version                                      | Check            |
| ------- | -------------------------------------------- | ---------------- |
| Node.js | 24 (see `.nvmrc`); 22.12 or newer also works | `node --version` |
| npm     | comes with Node                              | `npm --version`  |
| Git     | any recent version                           | `git --version`  |

You do **not** need a database or an API key to try the project. PostgreSQL (Neon) and a Gemini key are only needed
for persistent storage and live AI runs.

## Install

```bash
git clone https://github.com/Gokul-44/AI-Software-Requirement-Planning-Agent.git
cd AI-Software-Requirement-Planning-Agent
npm install
```

## Environment files

| File                  | Used by     | Needed?                       |
| --------------------- | ----------- | ----------------------------- |
| `apps/api/.env`       | the API     | only for Gemini or PostgreSQL |
| `apps/web/.env.local` | the website | optional                      |

Create them from the examples (the real files are gitignored and must never be committed):

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local   # optional
```

Main API variables (all are documented inside `apps/api/.env.example`):

| Variable                                                           | Meaning                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `LLM_PROVIDER`                                                     | `mock` (default), `replay` or `gemini`                                 |
| `GEMINI_API_KEY`                                                   | your Google AI Studio key (Gemini only)                                |
| `GEMINI_MODEL`                                                     | the Gemini model name, for example a Flash or Flash-Lite model         |
| `DATABASE_URL`                                                     | PostgreSQL connection string; leave empty and set `USE_MEMORY_DB=true` |
| `USE_MEMORY_DB`                                                    | `true` keeps runs in memory (lost when the server stops)               |
| `DAILY_RUN_CAP`, `RATE_LIMIT_RUNS_PER_HOUR`, `MAX_CONCURRENT_RUNS` | protect the free model quota                                           |

## Mock or Gemini?

| Mode         | Command            | Model                       | Storage          | Key needed |
| ------------ | ------------------ | --------------------------- | ---------------- | ---------- |
| Mock         | `npm run dev:mock` | deterministic offline mock  | in memory        | no         |
| Gemini       | `npm run dev`      | Google Gemini (free tier)   | as in the `.env` | yes        |
| Website only | `npm run dev:web`  | none, recorded sample plans | none             | no         |

The mock produces a complete, valid plan for any idea, so every screen, the scheduler and the exports can be tried
without spending quota.

## Run

**Mock stack (recommended first run):**

```bash
npm run dev:mock
```

Open http://localhost:5173, type an idea and press the button. The API listens on http://localhost:3001
(`/api/health` shows its state).

**With Gemini:** put `LLM_PROVIDER=gemini`, `GEMINI_API_KEY=...` and `GEMINI_MODEL=...` in `apps/api/.env`. Either set
`DATABASE_URL` to a PostgreSQL database (run `npm run migrate -w @spm/api` once) or set `USE_MEMORY_DB=true`. Then:

```bash
npm run dev
```

A live run takes about one to two minutes on the free tier. If the free quota is used up, the website offers the sample
plans instead.

## Test and check

```bash
npm run typecheck   # TypeScript, all workspaces
npm test            # unit, contract and property-based tests (no network, no real model)
npm run lint        # ESLint and Prettier check
npm run build       # production build of all packages and the website
npm run test:e2e    # browser smoke test on the mock stack
```

The end-to-end test needs a Chromium browser. Install Playwright's with `npx playwright install chromium`, or point
`E2E_CHROMIUM_PATH` at an installed Chrome or Chromium executable.

## Troubleshooting

| Problem                             | Fix                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Port 3001 or 5173 is already in use | stop the other server, or set `API_PORT` / `WEB_PORT` before `npm run dev` |
| API says `DATABASE_URL is not set`  | set `USE_MEMORY_DB=true`, or use `npm run dev:mock`                        |
| Live runs fail with "quota used up" | the free Gemini quota is exhausted; use the mock or the sample plans       |
| Type errors after pulling           | run `npm install`, then `npm run typecheck`                                |
