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

**Pre-Phase 0: planning.** The master plan is drafted in [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md) and is **waiting for team approval**. No application code has been written.

## Decisions

| ID   | Decision                                                                                                    | Status                       |
| ---- | ----------------------------------------------------------------------------------------------------------- | ---------------------------- |
| D-01 | 12 weeks × ~10 h/week/person (assumed)                                                                      | Proposed, needs confirmation |
| D-02 | Role ↔ person mapping (GEN / SCH / BE / FE)                                                                 | **Open**                     |
| D-03 | LLM provider and model chosen by evaluation; who funds the API key                                          | **Open**                     |
| D-04 | TypeScript monorepo (npm workspaces): apps/web, apps/api, packages/shared, scheduler, exporters             | Proposed                     |
| D-05 | Relaxed sprint packing (same-sprint chains allowed, bounded by hours); strict deck rule kept for comparison | Proposed                     |
| D-06 | Gantt shows the capacity-feasible plan; CPM (unlimited people) as a labelled toggle                         | Proposed                     |
| D-07 | Cycles: Tarjan SCC reporting → 1 SCC-limited LLM re-proposal → user resolution; all logged                  | Proposed                     |
| D-08 | Oversize guard: config invariant C ≥ 13 and H ≥ hours(13), plus a typed error                               | Proposed                     |
| D-09 | Risk severity computed by code; every risk cites ≥ 1 signal ID                                              | Proposed                     |
| D-10 | Story-level requirement_ids[] (M:N) plus coverage checks                                                    | Proposed                     |
| D-11 | Run progress by polling every 2 s                                                                           | Proposed                     |
| D-12 | Hosting: Vercel + Render + Neon; spend cap, rate limit, optional access code                                | Proposed                     |
| D-13 | Default config: 4 devs, 10-day sprints, 6 focus h/day, 10 pts/person, 4 h/point                             | Proposed                     |
| D-14 | Commits under each member's own name and email; no AI co-author trailers                                    | **Agreed** (team rule)       |

## Next steps

1. The team reviews `docs/MASTER_PLAN.md` and answers the open questions below.
2. Assign roles, create the GitHub repository and the Jira Cloud test site, and choose the LLM provider.
3. Week 1 (Phase 0): freeze `contracts-v1`, build the fixture `plan.json`, write the scheduler golden tests (failing), set up CI, and run the Jira CSV import spike.

## Open questions

1. Exact deadlines (mid-term review, report, final viva) and available hours per week.
2. Who takes which role?
3. LLM provider, model shortlist, budget owner and monthly cap.
4. Is TypeScript acceptable instead of plain JavaScript?
5. Input length: one line only, or up to 2000 characters?
6. Is plan editing in scope for v1? (Proposed: no; it is an extra.)
7. Jira target: company-managed or team-managed project?
8. Does the department expect an evaluation table or paper-style report?
9. Should the public demo be open, or gated by an access code?

## Progress log

- 2026-11-14: Step 1 done. Monorepo foundation (npm workspaces, strict TS 6.0, ESLint, Prettier, Vitest, CI) and the @spm/shared contracts (C4 stage schemas, PlanSchema v1.0 with assertPlanIntegrity, ConfigSchema, API DTOs and error envelope, JSON Schema helper) are in place; typecheck, lint and 80 tests pass.
- 2026-11-14: Step 2 done. @spm/scheduler is complete and pure: validateEdges, checkAcyclic (Kahn, Tarjan, one cycle path per SCC), computeCpm (integer hours), priorityOrder, packSprints (relaxed and strict), computeSignals (all 14 kinds), coverage helpers, duplicate-title detector and one entry point schedulePlan. Tests cover the E1 known answers plus 1,000 fast-check DAGs; typecheck, lint and 151 tests pass. Finding: the E1 invariant "strict sprint count >= relaxed" is not a theorem (greedy packing anomaly, about 1.4% of random DAGs), so it is checked statistically and the smallest counterexample is pinned in a test.
- 2026-11-14: Step 3 done. Sample plan: hand-written `fixtures/plan-input.food-delivery.json` (13 requirements, 4 epics, 10 stories, 27 tasks, 36 dependencies plus two deliberately bad edges) is stamped, scheduled and assembled by `npm run fixture` (`scripts/build-fixture.ts`) into `fixtures/plan.food-delivery.json` and `apps/web/public/golden/food-delivery.json` (4 sprints, CPM 172 h, 12 signals, 5 risks that cite real signal IDs, 3 issues). `@spm/exporters` now has `toJiraCsv` and `toMarkdown` (pure, with CSV formula and Markdown HTML escaping); `docs/samples/jira-sample.csv` and `docs/jira-mapping.md` are written, and the Jira mapping is still UNVERIFIED until the Week 1 import test.
- 2026-11-14: Step 6 done. `apps/web` is a complete plan UI that runs on the fixture alone (Vite, React 19, TypeScript, React Router, TanStack Query, Tailwind 4, @xyflow/react with dagre, custom SVG Gantt). All data access sits in `src/api`: `VITE_USE_FIXTURE=true` (the default when `VITE_API_BASE_URL` is empty) loads `/golden/*.json` and simulates a run in the browser, otherwise the UI calls the C3 API. Pages: Home (idea 10-2000 characters, collapsible config form with live C and H checks, golden demos), run progress (8-stage stepper, polls every 2 s), and the plan view with Overview, Requirements, Stories, Tasks, Graph, Timeline (sprint plan vs CPM toggle), Sprints, Risks and Issues tabs. A what-if panel on Timeline and Sprints re-runs `@spm/scheduler` in the browser; Jira CSV, Markdown and JSON exports are generated with `@spm/exporters`. Start it with `npm run dev:web` (http://localhost:5173) or the `web` entry in `.claude/launch.json`. Typecheck, lint, build and 216 tests pass.
