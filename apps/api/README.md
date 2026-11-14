# @spm/api

The Express API. It runs the eight-stage planning pipeline in the background, stores every run, and serves the plan and
its exports.

## Layout

| Folder          | Purpose                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `src/app.ts`    | routes, rate limits, CORS and error handling                                                   |
| `src/pipeline/` | the stages: requirements, stories, tasks, estimates, dependencies, scheduling, risks, assembly |
| `src/llm/`      | provider abstraction: `gemini`, `mock`, `replay`; validation and repair harness; cache         |
| `src/prompts/`  | versioned prompt files (`stage<N>.v<k>.md`)                                                    |
| `src/db/`       | repository interface with PostgreSQL and in-memory implementations                             |
| `src/eval/`     | evaluation runner and metrics (`npm run eval`)                                                 |
| `src/scripts/`  | command-line helpers: live run, golden plan record and export                                  |
| `migrations/`   | additive SQL migrations                                                                        |

## Endpoints

| Method and path                                    | Purpose                                             |
| -------------------------------------------------- | --------------------------------------------------- |
| `GET /api/health`                                  | service, database and model status                  |
| `POST /api/projects`                               | start a run from an idea and optional team settings |
| `GET /api/projects`                                | run history                                         |
| `GET /api/runs/:id`, `GET /api/runs/:id/plan`      | run progress and the finished plan                  |
| `POST /api/runs/:id/rerun`                         | re-plan from a stage with new settings              |
| `POST /api/runs/:id/resolve-cycle`                 | remove chosen edges to break a dependency cycle     |
| `GET /api/runs/:id/export/jira.csv`, `.../plan.md` | exports                                             |
| `GET /api/demo/golden`                             | recorded sample plans                               |

## Run and test

```bash
npm run dev:mock          # from the repository root: mock model, in-memory store
npm run dev -w @spm/api   # API only, settings from apps/api/.env
npm test -w @spm/api      # no network, no real model
```

Environment variables are documented in [`.env.example`](.env.example) and in
[docs/guides/local-setup.md](../../docs/guides/local-setup.md).
