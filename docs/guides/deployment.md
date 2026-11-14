# Deployment guide

The project runs as three free-tier services plus GitHub Actions:

| Part                           | Service        | Config in the repo                           |
| ------------------------------ | -------------- | -------------------------------------------- |
| Website (React, `apps/web`)    | Vercel         | `apps/web/vercel.json`                       |
| API (Express, `apps/api`)      | Render         | `render.yaml`                                |
| Database (PostgreSQL)          | Neon           | `neon.ts`, `apps/api/migrations/*.sql`       |
| Checks, migration, API deploy  | GitHub Actions | `.github/workflows/ci.yml`, `deploy.yml`     |
| AI model (free tier)           | Google Gemini  | `GEMINI_API_KEY`, `GEMINI_MODEL` on Render   |

**Rule: you type every password, key and secret yourself.** Nothing secret is stored in the repository. The
variables below are only _names_ and safe example values.

## How a deploy happens

1. You push to `main`.
2. GitHub Actions (`deploy.yml`) runs lint, typecheck, tests and the build.
3. If they pass, it applies new database migrations to Neon (`npm run migrate:deploy`).
4. Then it calls the Render deploy hook, and Render builds and starts the new API.
5. Vercel builds and publishes the website from the same push by itself.

## One-time setup (about 30 minutes)

### 1. Push the code to GitHub

```bash
git remote add origin https://github.com/Gokul-44/AI-Software-Requirement-Planning-Agent.git
```

```bash
git push -u origin main
```

If the GitHub repository is not empty, stop and ask before doing anything else. Never force-push.

### 2. Render (the API)

1. Render dashboard → **New** → **Blueprint** → pick the repository. Render reads `render.yaml` and proposes the
   service `spm-planning-agent-api` (free plan, Singapore region).
   - If the Blueprint wizard rejects the file, create a **Web Service** by hand instead: Runtime **Node**,
     Build command `npm ci --include=dev && npm run build:api`, Start command `npm run start:api`, Health check path
     `/api/health`, Auto-Deploy **Off**, Instance type **Free**, and add the variables below.
2. Fill in the variables Render asks for (marked "sync: false" in `render.yaml`):

| Name               | Value                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `DATABASE_URL`     | The Neon **pooled** connection string (host contains `-pooler`)                                 |
| `GEMINI_API_KEY`   | Your Gemini key                                                                                 |
| `GEMINI_MODEL`     | The model name, for example the one in your local `apps/api/.env`                               |
| `CORS_ORIGIN`      | The Vercel website URL, for example `https://your-app.vercel.app` (set after step 3)            |
| `DEMO_ACCESS_CODE` | Optional. If set, people need this code to start a live (Gemini) run. Leave empty for open demo |

These are already set to safe values by `render.yaml`: `NODE_ENV=production`, `LLM_PROVIDER=gemini`,
`LLM_MIN_INTERVAL_MS=6500`, `DAILY_RUN_CAP=15`, `RATE_LIMIT_RUNS_PER_HOUR=3`, `MAX_CONCURRENT_RUNS=1`.

3. Copy the service URL (`https://spm-planning-agent-api.onrender.com` or similar).
4. Render service → **Settings** → **Deploy Hook** → copy the hook URL (you need it in step 4).

### 3. Vercel (the website)

1. Vercel → **Add New** → **Project** → import the repository. Vercel says "Multiple applications detected":
   click **Import single project** next to **web** (Vite). Do not import `api`; the API runs on Render.
2. Settings (check they match; the single-page-app rewrite comes from `apps/web/vercel.json`):
   - **Root Directory:** `apps/web`
   - **Framework Preset:** Vite
   - **Build Command** and **Install Command:** leave as they are (they come from `apps/web/vercel.json`, which builds from the repository root)
   - **Output Directory:** `dist`
3. **Environment Variables** → add `VITE_API_BASE_URL` = the Render URL **plus `/api`**, for example
   `https://spm-planning-agent-api.onrender.com/api`. (Leave `VITE_USE_FIXTURE` unset.)
4. Deploy. Copy the Vercel URL, then go back to Render and set `CORS_ORIGIN` to it.

The sample plans live in the website itself (`apps/web/public/golden`), so they open even when the API is asleep or
down.

### 4. GitHub secrets (for `deploy.yml`)

GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name                     | Value                                                                           |
| ------------------------ | ------------------------------------------------------------------------------- |
| `DATABASE_URL`           | The Neon **direct** connection string (**unpooled**, host has no `-pooler`)     |
| `RENDER_DEPLOY_HOOK_URL` | The Render deploy hook URL from step 2                                          |

### 5. First migration

The Neon database already has the tables from the build days. To be sure it is current, run once from your computer
(the same command the workflow runs; with the unpooled URL in `DATABASE_URL`) or just re-run the **Deploy** workflow
in the GitHub **Actions** tab. When everything is applied it prints that there is nothing to run.

## Checking the live site

- API: open `<Render URL>/api/health` → `{"status":"ok","db":"ok",...}`.
- Website: open the Vercel URL, open a sample plan, check every tab and the three export buttons.
- Live run: enter an idea on the landing page and wait about 2–5 minutes.

## Before the demo (important)

- **Warm up 5 minutes before the demo.** Render's free plan puts the API to sleep after about 15 minutes without
  traffic, and the first request after that takes about 50 seconds. Open `<Render URL>/api/health` a few times until it
  answers quickly.
- **Check the AI quota.** The Gemini free tier has a daily request limit. A live run needs many model calls. If the
  quota is used up, the site shows "The free AI quota is used up right now"; use the sample plans, which need no AI.
- The site protects the free quota with `DAILY_RUN_CAP` (live runs per day), `RATE_LIMIT_RUNS_PER_HOUR` (per visitor),
  `MAX_CONCURRENT_RUNS` and an optional `DEMO_ACCESS_CODE`.
- Keep a screen recording of one full live run as a backup.

## Safety

- `.env` files are ignored by git and are never committed. The only committed env files are `.env.example` files with
  empty values.
- Rotate the Gemini key if it was ever shown in a screenshot, chat or log.
- The database is Neon's `production` branch. Migrations are additive SQL files; never edit an applied migration.

## If something goes wrong

| Symptom                                    | Likely cause and fix                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Website loads but "Live API" calls fail    | `CORS_ORIGIN` on Render does not match the Vercel URL exactly (no trailing slash)         |
| First request takes about a minute         | Render free tier was asleep; wait, then it is fast                                        |
| `deploy.yml` fails in **migrate**          | `DATABASE_URL` secret missing, or it is the pooled URL; use the direct (unpooled) one     |
| `deploy.yml` fails in **deploy-api**       | `RENDER_DEPLOY_HOOK_URL` secret missing or wrong                                          |
| Render build fails on TypeScript           | Build command must keep `--include=dev`                                                   |
| "Quota used up" on every live run          | Gemini daily limit reached; wait for the reset or switch `GEMINI_MODEL` on Render         |
