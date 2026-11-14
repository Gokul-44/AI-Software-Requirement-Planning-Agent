# Project Status: AI Software Requirement & Planning Agent

_Last updated: 2026-11-14_

## Objective

Build and deploy a web system that takes a one-line software idea and returns a traceable, schedule-consistent plan:

- requirements (functional and non-functional)
- epics
- user stories with acceptance criteria
- tasks
- estimates
- a validated dependency graph
- a critical path
- a capacity-feasible sprint plan
- a grounded risk register

The plan exports to Jira CSV and Markdown. Design principle: **AI generates, algorithms verify.**

## Current phase

**Build day (one-day full build).** The plan in [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md) is approved. The build follows [docs/BUILD_PROMPTS.md](docs/BUILD_PROMPTS.md). Steps 1-5 are done (see the progress log). Next: Steps 6-8 (stages 4-8 and plan assembly, live UI, Opus review).

## Decisions (locked 2026-11-14)

| ID   | Decision                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| D-01 | One-day full build; keep every important feature (cut only the listed extras)                                 |
| D-02 | No role split during the build; work is divided equally among the 4 members afterwards                        |
| D-03 | LLM: free-tier Google Gemini (Flash model from GEMINI_MODEL), plus mock and replay providers                  |
| D-04 | TypeScript monorepo (npm workspaces): apps/web, apps/api, packages/shared, scheduler, exporters               |
| D-05 | Relaxed sprint packing (same-sprint chains allowed, bounded by hours); strict deck rule kept for comparison   |
| D-06 | Gantt shows the capacity-feasible plan; CPM (unlimited people) as a labelled toggle                           |
| D-07 | Cycles: Tarjan SCC reporting → 1 SCC-limited LLM re-proposal → user resolution; all logged                    |
| D-08 | Oversize guard: config invariant C ≥ 13 and H ≥ hours(13), plus a typed error                                 |
| D-09 | Risk severity computed by code; every risk cites ≥ 1 signal ID                                                |
| D-10 | Story-level requirement_ids[] (M:N) plus coverage checks                                                      |
| D-11 | Run progress by polling every 2 s                                                                             |
| D-12 | Hosting: Vercel + Render + Neon; per-IP rate limit, daily run cap (protects free quota), optional access code |
| D-13 | Default config: 4 devs, 10-day sprints, 6 focus h/day, 10 pts/person, 4 h/point                               |
| D-14 | Commits under each member's own name and email; no AI co-author trailers                                      |

## Open items

1. Secrets live only in apps/api/.env (gitignored): DATABASE_URL (Neon) and GEMINI_API_KEY. Rotate the Gemini key before the public deploy (Step 10).
2. Free-tier Flash model is gemini-3.6-flash (exists, supports generateContent). Its requests-per-minute limit could NOT be confirmed (the public docs show no free-tier table; AI Studio rate-limit page needs a login), so LLM_MIN_INTERVAL_MS stays 6500. Check the AI Studio rate-limit page.
3. Jira CSV mapping is unverified until a real import test.
4. Divide the work equally among the 4 members after the build (Step 11).

## Progress log

- 2026-11-14: Step 1 done. Monorepo foundation (npm workspaces, strict TS 6.0, ESLint, Prettier, Vitest, CI) and the @spm/shared contracts (C4 stage schemas, PlanSchema v1.0 with assertPlanIntegrity, ConfigSchema, API DTOs and error envelope, JSON Schema helper) are in place; typecheck, lint and 80 tests pass.
- 2026-11-14: Step 2 done. @spm/scheduler is complete and pure: validateEdges, checkAcyclic (Kahn, Tarjan, one cycle path per SCC), computeCpm (integer hours), priorityOrder, packSprints (relaxed and strict), computeSignals (all 14 kinds), coverage helpers, duplicate-title detector and one entry point schedulePlan. Tests cover the E1 known answers plus 1,000 fast-check DAGs; typecheck, lint and 151 tests pass. Finding: the E1 invariant "strict sprint count >= relaxed" is not a theorem (greedy packing anomaly, about 1.4% of random DAGs), so it is checked statistically and the smallest counterexample is pinned in a test.
- 2026-11-14: Step 3 done. Sample plan: hand-written `fixtures/plan-input.food-delivery.json` (13 requirements, 4 epics, 10 stories, 27 tasks, 36 dependencies plus two deliberately bad edges) is stamped, scheduled and assembled by `npm run fixture` (`scripts/build-fixture.ts`) into `fixtures/plan.food-delivery.json` and `apps/web/public/golden/food-delivery.json` (4 sprints, CPM 172 h, 12 signals, 5 risks that cite real signal IDs, 3 issues). `@spm/exporters` now has `toJiraCsv` and `toMarkdown` (pure, with CSV formula and Markdown HTML escaping); `docs/samples/jira-sample.csv` and `docs/jira-mapping.md` are written, and the Jira mapping is still UNVERIFIED until the Week 1 import test.
- 2026-11-14: Step 4 done. `apps/web` is a complete plan UI that runs on the fixture alone (Vite, React 19, TypeScript, React Router, TanStack Query, Tailwind 4, @xyflow/react with dagre, custom SVG Gantt). All data access sits in `src/api`: `VITE_USE_FIXTURE=true` (the default when `VITE_API_BASE_URL` is empty) loads `/golden/*.json` and simulates a run in the browser, otherwise the UI calls the C3 API. Pages: Home (idea 10-2000 characters, collapsible config form with live C and H checks, golden demos), run progress (8-stage stepper, polls every 2 s), and the plan view with Overview, Requirements, Stories, Tasks, Graph, Timeline (sprint plan vs CPM toggle), Sprints, Risks and Issues tabs. A what-if panel on Timeline and Sprints re-runs `@spm/scheduler` in the browser; Jira CSV, Markdown and JSON exports are generated with `@spm/exporters`. Start it with `npm run dev:web` (http://localhost:5173) or the `web` entry in `.claude/launch.json`. Typecheck, lint, build and 216 tests pass.
- 2026-11-14: Step 5 done (stages 1-3 live path). `apps/api` has Express 5 + TypeScript (pino-http request ids, helmet, CORS_ORIGIN, 50 kb JSON limit, C3 error envelope), node-pg-migrate migration `001_init.sql` (C2 DDL plus `runs.plan`; applied to the Neon production branch once, additive only; `npm run migrate -w @spm/api` uses DATABASE_URL_UNPOOLED, `migrate:down` exists but must not be run on production), a thin `pg` repository (pooled URL, small pool, 20 s connect timeout) plus an in-memory twin for tests, and the LLM layer: `LlmClient`, providers gemini (@google/genai, `responseJsonSchema`), mock (deterministic, any idea) and replay (serves stage_cache), a concurrency-1 queue with a minimum gap (LLM_MIN_INTERVAL_MS 6500) and 429/5xx backoff honouring the server retry delay (max 3), and the `callStage` harness (cache key, stop-reason check, Zod, semantic check, 2 repair retries, usage in stage_executions). Prompts are `stage1/2/3.v1.md` (idea inside delimiters, labelled as data). The orchestrator stamps ids, runs coverage C1 and C2 with one targeted retry each, then records a warning issue, runs stage 3 one epic at a time, and recovers interrupted runs at startup. Endpoints: POST /api/projects (202), GET /api/runs/:id, GET /api/projects, GET /api/health. For now a run that finishes stage 3 is marked `succeeded` (stages 4-8 stay pending until Step 6). Finding: Gemini 3.6 Flash answers 400 INVALID_ARGUMENT for the stage 2 schema when nested `minItems`/`maxItems` are present, so the Gemini schema carries array bounds as description hints and Zod enforces them. Gemini calls are slow on the free tier (about 30-45 s for a few hundred output tokens), so GEMINI_TIMEOUT_MS defaults to 240 s. Live check: stage 1 for the food-delivery idea succeeded on the first attempt (10 requirements, 28.6 s); the first stage 2 call failed with the 400 above, the fix was verified with one direct diagnostic call, and the full stages 1-3 live run is still to be repeated once. Typecheck, lint and 44 tests pass (2 database tests run only with SPM_DB_TESTS=1).
