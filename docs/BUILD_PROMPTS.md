# Build Prompts: one-day full build

Copy each prompt below into Claude Code, **one step at a time, in order**. Each step ends with passing checks, a commit and a progress-log line, so the next step can begin from a clean state.

---

## How to use this (read once)

**Model per step**
- **Opus** handles planning, review and decisions: Steps 8 and 11.
- **Sonnet** writes code: Steps 1–7, 9 and 10.
- To switch: in the desktop app, use the model picker next to the message box. In the CLI, type `/model sonnet` or `/model opus`.
- Use **medium effort** for Sonnet steps.

**Saving tokens**
1. **Start each step in a fresh session** (or `/clear`). Every prompt is self-contained and tells Claude which files and sections to read, so no chat history is needed.
2. Claude reads `PROJECT_STATUS.md` plus **only the MASTER_PLAN sections named in the prompt**, never the whole plan.
3. Claude checks its work by **running tests and builds**, not by re-reading the files it just wrote.
4. If a step fails halfway, don't restart it. Say: *"Continue Step N from where it stopped; check git status and the progress log first."*
5. Don't paste errors from the screen. Say *"run the tests and fix the failures"*, and Claude reads them itself.

**Before Step 1 (you, about 15 minutes)**
- [ ] Node.js 20+ installed. Check with `node -v`.
- [ ] Git identity set to **your own** name and email:
  ```bash
  git config --global user.name "Your Name"
  ```
  ```bash
  git config --global user.email "you@example.com"
  ```
- [ ] **Gemini API key** from Google AI Studio (free tier). Keep it ready; it goes into `apps/api/.env` in Step 5.
- [ ] In AI Studio, note the **current free-tier Flash model name** and its **requests-per-minute** limit. You'll need both in Step 5.
- [ ] **Neon** account with one Postgres project. Copy its connection string (`DATABASE_URL`) for Step 5.
- [ ] Before Step 10: GitHub repository, plus Render and Vercel accounts, signed in with GitHub.
- ⚠️ Free-tier Gemini prompts may be used by Google to improve its products (check Google's current terms). Don't type confidential client ideas into it.

**If you run behind schedule, use this priority order**
- Steps 1–4 already give a **demoable product** (full UI on a realistic sample plan).
- Steps 5–7 add live AI.
- Step 10 deploys.
- Step 9 (evaluation) can run after deployment if needed.

**What we deliberately skip today** (optional extras; the core is unaffected): SSE live updates, editing tasks in the UI, 3× estimate sampling, Monte-Carlo schedules, a commit-message hook, CODEOWNERS, multi-provider support.

**Approximate timeline (estimates):**

| Step | Model | Time |
|---|---|---|
| 1 Foundation | Sonnet | 45 min |
| 2 Scheduler | Sonnet | 60 min |
| 3 Fixture + exporters | Sonnet | 45 min |
| 4 Frontend | Sonnet | 90 min |
| 5 Backend + Gemini | Sonnet | 90 min |
| 6 Stages 4–8 | Sonnet | 90 min |
| 7 Connect UI to API | Sonnet | 60 min |
| 8 Review | **Opus** | 30 min |
| 9 Fixes + evaluation | Sonnet | 75 min |
| 10 Deploy | Sonnet | 60 min |
| 11 Final pack | **Opus** | 40 min |

Total: about 11–12 hours of Claude work, plus your checking time.

---

## STEP 1 · Sonnet · Foundation and shared contracts

```text
You are building the project in D:\SPM. Read PROJECT_STATUS.md, then ONLY these sections of docs/MASTER_PLAN.md: C1 (layout), C3 (API + error model), C4 (stage output schemas), C5 (plan.json contract), C6 (default config), D5 (git workflow).

GOAL: monorepo foundation + the shared contracts that every later step depends on.

DO:
1. git init if needed. Add a .gitignore covering node_modules, dist, .env*, coverage and playwright reports. Commit .env.example files only.
2. Root package.json with npm workspaces: apps/web, apps/api, packages/shared, packages/scheduler, packages/exporters. Add a strict TypeScript base config, ESLint + Prettier, and Vitest. Root scripts: dev, build, test, typecheck, lint.
3. Turn off Claude co-author/attribution trailers for commits and PRs in this project's .claude/settings.json. Use the update-config skill to get the correct setting key.
4. packages/shared (Zod, TypeScript):
   - Stage output schemas exactly as in C4 (stages 1, 2, 3, 4, 5, 7), with the extra Zod rules listed there.
   - PlanSchema (plan.json v1.0) exactly as in C5. Also add an assertPlanIntegrity(plan) function that checks every cross-reference resolves.
   - ConfigSchema with the C6 defaults and the invariant C = team_size*velocity >= 13 and H = sprint_length_days*focus_hours_per_day >= hours(13). Error message: INVALID_CONFIG.
   - Types for Issue, Signal, RunStatus and the API DTOs from C3, plus the ApiError envelope and its error codes.
   - A helper that converts a Zod schema to JSON Schema, using whatever the installed Zod version supports. Check the installed version; don't guess.
   - Unit tests: valid examples pass; mutated examples (missing field, bad enum, bad ID pattern, config below the invariant) fail.
5. .github/workflows/ci.yml: npm ci, then lint, typecheck, test, build. CI must never call a real LLM.

CHECK: npm run typecheck, npm test and npm run lint all pass.
FINISH: commit "chore: monorepo foundation and shared contracts" using the existing git identity. No Co-Authored-By or AI trailers. Append one line to the PROJECT_STATUS.md progress log. Stop; do not start Step 2.
```

---

## STEP 2 · Sonnet · Scheduler (pure functions, test-first)

```text
Project D:\SPM. Read PROJECT_STATUS.md, then ONLY these MASTER_PLAN.md sections: B1 (Issues 2, 3, 5, 6), B2 rows N1–N3, B4 (all), B5 (signals table), D2 item 3 (function signatures), E1 (known-answer tests).

GOAL: packages/scheduler, pure TypeScript with no I/O, fully tested. This is the "algorithms verify" core of the project, so correctness matters more than speed.

DO (write the tests FIRST, then the code):
1. Tests from E1 with the EXACT expected numbers: the 6-task CPM table, duration 52, critical path A-B-D-F, priority order A,B,C,D,E,F, strict packing (4 sprints), relaxed packing (S1 {A,B,C,E}, S2 {D,F}), OversizedTaskError for both points and hours (test timeout 100 ms), the cycle cases (exact SCC [[A,B,C]] with blocked [D], two disjoint cycles, self-loop removed by validateEdges), empty graph, single task, isolated task, disconnected components, and tie-break determinism under shuffled input.
2. Implement, using the D2 signatures: validateEdges, checkAcyclic (Kahn, then Tarjan on V\L, plus one concrete cycle path per SCC), computeCpm (integer hours; LF(sink) = project duration), priorityOrder (priority-queue Kahn, key: slack asc, descendants desc, code asc), packSprints (modes "relaxed" and "strict", guard first, returns sprints, loads, planned_start and planned_finish), descendantCounts, criticalPath (one chain for display plus a flag on every critical task).
3. computeSignals(plan core, thresholds) for every signal kind in the B5 table, with code-computed severity and numeric messages. Also add coverage helpers (C1/C2/C3 from B1 Issue 1) and a duplicate-title detector (normalised token Jaccard >= 0.8).
4. Property tests with fast-check: 1000 random DAGs of up to 150 nodes, checking every invariant listed in E1.
5. Export a single entry point schedulePlan(core, config) that returns everything plan.json "schedule" + "signals" needs, so both the API and the browser can call it.

CHECK: npm test passes. In your final message, print the computed 6-task table.
FINISH: commit "feat(scheduler): validation, cycles, CPM, sprint packing, signals" (no AI trailers). Append a line to the progress log. Stop.
```

---

## STEP 3 · Sonnet · Realistic fixture plan and exporters

```text
Project D:\SPM. Read PROJECT_STATUS.md, then ONLY these MASTER_PLAN.md sections: B1 Issue 7 (Jira CSV), B2 row N11 (injection), C5 (plan.json), B5 (signals and risk rules).

GOAL: (a) a realistic, internally consistent sample plan that the UI is built against, and (b) the export package.

DO:
1. fixtures/plan-input.food-delivery.json, hand-written and realistic for an online food delivery app:
   - about 12 requirements (at least 3 non-functional)
   - 4 epics, about 10 stories with acceptance criteria and requirement_ids
   - about 25 tasks across all layers, with points
   - about 30 depends_on links that make engineering sense
2. scripts/build-fixture.ts: loads that input, stamps IDs, runs schedulePlan from packages/scheduler with the default config, adds 4–5 hand-written risks that cite REAL signal IDs from the computed signals, assembles plan.json, validates it with PlanSchema + assertPlanIntegrity, and writes fixtures/plan.food-delivery.json. Also copy it to apps/web/public/golden/food-delivery.json (create the folders).
3. packages/exporters:
   - toJiraCsv(plan): Epic, then Story, then Sub-task rows, linked through Issue Id / Parent Id. Columns: Issue Type, Summary (prefixed with our code), Description (story text + acceptance criteria; layer for tasks), Priority, Story Points, Labels (R-codes and sprint-N, using repeated Labels columns), Blocked By (as text). Use RFC-4180 quoting, and escape formula injection by prefixing cells that start with = + - @ tab or CR with an apostrophe.
   - toMarkdown(plan): overview numbers, assumptions, a requirements traceability table, epics/stories/tasks, sprints, risks with their cited signals, issues, a Mermaid gantt and a Mermaid graph of the critical path.
   - Tests: snapshot tests on the fixture, an injection-escaping test, a CSV parse-back row-count test, and a test that the Markdown contains every T-code.
4. Write docs/samples/jira-sample.csv from the fixture. Write docs/jira-mapping.md: the column mapping, a note that it is UNVERIFIED until imported into a Jira Cloud test project, and steps for doing that test.

CHECK: npm test passes; the build-fixture script runs cleanly.
FINISH: commit "feat: sample plan fixture and Jira/Markdown exporters" (no AI trailers). Append to the progress log. Stop.
```

---

## STEP 4 · Sonnet · Full frontend on the fixture

```text
Project D:\SPM. Read PROJECT_STATUS.md, then ONLY these MASTER_PLAN.md sections: C3 (API), C5 (plan.json), B1 Issue 4 (two timelines), B6 row 7 (what-if). The data is apps/web/public/golden/food-delivery.json.

GOAL: a polished, complete React UI that works today on the fixture alone. This is what we show sir, so it must look professional and clear.

DO:
1. apps/web: Vite + React + TypeScript, React Router, TanStack Query, Tailwind. Use @xyflow/react with dagre for the graph, and a custom SVG Gantt. Put all data access in src/api with a switch: VITE_USE_FIXTURE=true loads /golden/*.json; otherwise it calls VITE_API_BASE_URL.
2. Pages:
   - Home: idea textarea (10–2000 chars), a collapsible config form with defaults and live invariant validation, and a list of "golden demo" plans.
   - Run progress: the 8 stages as a stepper with status, attempts and time. Leave it ready for polling; it is wired up in Step 7.
   - Plan view with tabs:
     - Overview: summary, assumptions, and cards for CPM minimum days, capacity-plan sprints and days, capacity-bound ratio, coverage %, task/edge counts and issue counts.
     - Requirements: traceability tree requirement → stories → tasks, with coverage badges.
     - Stories.
     - Tasks: table with filters by epic, layer and critical; sortable.
     - Graph: nodes coloured by epic, critical path in red, click a node for a details panel, "critical only" filter, fit view.
     - Timeline: Gantt with sprint bands and a toggle between "Sprint plan (capacity)" and "CPM (unlimited people)"; critical bars highlighted in both, with a clear label explaining the difference.
     - Sprints: board with a utilisation bar per sprint (red at 90% or more).
     - Risks: severity, description, mitigation, cited signals (with values) and linked tasks.
     - Issues.
     - Export buttons (Jira CSV, Markdown, JSON). In fixture mode, generate the files in the browser with packages/exporters.
3. What-if panel on the Timeline/Sprints tabs: sliders for team size, velocity and pack mode that recompute the schedule in the browser with packages/scheduler and show the before/after sprint count.
4. Clean, consistent design: readable typography, responsive down to laptop width, empty and error states, no console errors.

CHECK: npm run build passes. Start the dev server with the browser preview, open every tab on the fixture, take screenshots, and fix any layout problems or console errors you see.
FINISH: commit "feat(web): full plan UI on fixture data" (no AI trailers). Append to the progress log. Stop.
```

---

## STEP 5 · Sonnet · Backend core, Gemini harness, stages 1–3

```text
Project D:\SPM. Read PROJECT_STATUS.md, then ONLY these MASTER_PLAN.md sections: B3.1, B3.2, B3.3, B3.7, B1 Issue 1, B2 rows N4, N7, N8, N10, N13, C2 (DDL), C3 (API).

GOAL: the Express API with persistence, the LLM harness on free-tier Gemini, and live stages 1–3.

NEED FROM ME (ask once if missing): DATABASE_URL (Neon), GEMINI_API_KEY, GEMINI_MODEL (current free-tier Flash model), and the free-tier requests per minute. Put them ONLY in apps/api/.env (gitignored). Keep apps/api/.env.example up to date.

DO:
1. apps/api: Express + TypeScript, pino with request ids, helmet, cors (CORS_ORIGIN), JSON body limit 50 kb, and the error middleware producing the C3 envelope.
2. DB: node-pg-migrate with SQL migration 001 = the C2 DDL, plus a column runs.plan jsonb for the assembled snapshot. Add a thin repository layer using pg. Scripts: migrate, migrate:down.
3. LLM layer (apps/api/src/llm):
   - The LlmClient interface from B3.2.
   - Providers:
     - gemini, using the official @google/genai SDK with JSON-schema structured output. Check the exact config fields in the installed SDK's types/README; do not guess.
     - mock: a deterministic generator that returns schema-valid, plausible output for ANY idea. Used for tests, offline work and CI.
     - replay: serves responses from stage_cache.
   - Select with LLM_PROVIDER.
   - A rate-limited queue: concurrency 1, minimum gap LLM_MIN_INTERVAL_MS derived from the RPM, and 429/5xx backoff that honours the server's retry delay (max 3).
   - Map mode "extract" to temperature 0.2 where the provider supports it.
4. Harness callStage per B3.1: cache key, structured call, stop-reason check, Zod check, then a semantic validator, with up to 2 repair retries that feed back compact errors. Record usage and latency in stage_executions. Cost is 0 for the free tier, but keep the token counts.
5. Versioned prompt files src/prompts/stage1.v1.md, stage2.v1.md, stage3.v1.md, following the B3.3 contracts. The idea text goes inside delimiters and is labelled as data (N10).
6. Pipeline: an async orchestrator with run and stage statuses, startup recovery (running → failed INTERRUPTED), ID stamping, coverage C1 with one targeted retry, then a warning issue. Stage 3 runs one call per epic, sequentially because of the free tier, then checks coverage C2.
7. Endpoints: POST /api/projects (202 + run_id; validates input and config), GET /api/runs/:id (RunStatus), GET /api/projects, GET /api/health.
8. Tests (mock provider only): harness valid, malformed JSON, Zod-invalid, invalid references, truncation, and network retry; stamping determinism; an API test from POST to completed stage 3.

CHECK: npm test passes. Then do ONE real Gemini run of stages 1–3 for "I want an online food delivery app" and report the counts (requirements, epics, stories, tasks), attempts per stage and time per stage.
FINISH: commit "feat(api): harness, Gemini provider, stages 1-3" (no AI trailers; make sure .env is not committed). Append to the progress log. Stop.
```

---

## STEP 6 · Sonnet · Stages 4–8, persistence, exports, protection

```text
Project D:\SPM. Read PROJECT_STATUS.md, then ONLY these MASTER_PLAN.md sections: B1 Issues 3 and 6, B3.3 (stages 4, 5, 7), B3.6, B5, C2, C3, F4.

GOAL: the complete pipeline, idea to plan.json, persisted and exportable.

DO:
1. Stage 4: estimation prompt using the anchor scale; exact-coverage check with a targeted retry for missing tasks; hours from config.points_to_hours.
2. Stage 5: depends_on prompt. Use one call up to 80 tasks; above that, per-epic calls plus one cross-epic call (B3.6). Then validateEdges, recording issues for unknown references, self-loops, duplicates and suspicious layer-order edges.
3. Cycle handling: checkAcyclic. If cyclic, make ONE SCC-limited re-proposal call (send only the tasks and edges in each SCC). If still cyclic, set status needs_resolution and save the cycles. POST /api/runs/:id/resolve-cycle {remove_edges} resumes the pipeline. Log every removed edge as a cycle_repaired issue.
4. Stage 6: schedulePlan from packages/scheduler.
5. Stage 7: computeSignals, then the risk prompt (signals only). Reject any risk citing no signal or an unknown one; compute severity in code; if nothing survives, use template risks.
6. Stage 8: assemble plan.json, validate it with PlanSchema + assertPlanIntegrity, then persist in ONE transaction to the normalised tables (requirements, epics, stories, story_requirements, tasks, dependencies, schedule, sprints, risk_signals, risks, risk_evidence, plan_issues) and to the runs.plan snapshot.
7. Endpoints:
   - GET /api/runs/:id/plan
   - POST /api/runs/:id/rerun {from_stage, config} (new run with parent_run_id; reuses the cache)
   - GET /api/runs/:id/export/jira.csv and GET /api/runs/:id/export/plan.md (via packages/exporters)
   - GET /api/demo/golden
8. Protection (F4, adapted for free Gemini): per-IP rate limit (RATE_LIMIT_RUNS_PER_HOUR), MAX_CONCURRENT_RUNS, a DAILY_RUN_CAP counted from the runs table (protects the free quota), and an optional DEMO_ACCESS_CODE. Errors use the C3 codes.
9. Script npm run golden:record -- "<idea>": runs the pipeline and writes the plan to apps/web/public/golden/<slug>.json, marking the run is_golden.
10. Tests (mock provider): full pipeline end to end produces a valid plan; a forced cycle reaches needs_resolution and resolve-cycle completes it; a fake-ID edge is dropped; a risk citing a fake signal is rejected; rerun from stage 6 makes 0 LLM calls for stages 1–5; daily-cap 429.

CHECK: npm test passes. ONE real Gemini full run for "I want an online food delivery app". Report: counts, edges, cycles found or repaired, CPM days, sprint count, number of risks, issues, total tokens and total time.
FINISH: commit "feat(api): stages 4-8, persistence, exports, protection" (no AI trailers). Append to the progress log. Stop.
```

---

## STEP 7 · Sonnet · Connect the UI to the live API

```text
Project D:\SPM. Read PROJECT_STATUS.md, then ONLY MASTER_PLAN.md section C3. The UI (apps/web) and the API (apps/api) both exist.

GOAL: the full live flow in the browser.

DO:
1. Home form → POST /api/projects → navigate to the Run progress page, which polls GET /api/runs/:id every 2 s → open the plan view when it succeeds.
2. needs_resolution: show the cycle(s) as a small highlighted graph, let the user tick the edge(s) to remove, POST resolve-cycle, and continue polling.
3. Errors: friendly messages for every C3 code. On RATE_LIMITED, TOO_MANY_RUNS, the daily cap or LLM_UNAVAILABLE, offer "Open a golden demo plan".
4. Plan view: "Re-plan with new team settings" calls POST rerun from stage 6 (server-side). Keep the client-side what-if panel as an instant preview.
5. Export buttons call the API export endpoints in live mode; fixture mode keeps the in-browser export.
6. Project history page from GET /api/projects.
7. A root dev script that starts both the API and the web app.

CHECK: start both with LLM_PROVIDER=mock and use the browser preview to go through idea → progress → plan → every tab → export, taking screenshots. Then do one run with LLM_PROVIDER=gemini. Fix anything broken.
FINISH: commit "feat: live end-to-end flow in the UI" (no AI trailers). Append to the progress log. Stop.
```

---

## STEP 8 · OPUS · Review checkpoint (decisions only)

```text
Project D:\SPM. You are the lead reviewer. Read PROJECT_STATUS.md and docs/MASTER_PLAN.md sections B1, B2, B5, D4 (definitions of done). Run npm test and npm run build.

Then run the pipeline with real Gemini on 2 ideas: "Hospital appointment booking system" and the vague "An app to help farmers". Inspect the plans through the API or UI. Check:
- requirement coverage and traceability
- task granularity and duplicates
- dependency sensibility, edge direction and cycles
- schedule numbers (spot-check one CPM chain by hand)
- risks grounded in signals
- export correctness
- UI clarity for a non-technical examiner

Also review the code against the locked decisions D-01 to D-14 and the definitions of done in D4.

OUTPUT: write a "Review findings" section in PROJECT_STATUS.md with at most 10 fixes, ordered by impact on demo quality and viva defensibility. For each: what is wrong, where (file:line), and the exact fix. Do not implement anything except trivial one-line fixes. Commit "docs: review findings" (no AI trailers). Stop.
```

---

## STEP 9 · Sonnet · Apply fixes, evaluation, E2E, golden runs

```text
Project D:\SPM. Read PROJECT_STATUS.md (especially "Review findings") and ONLY MASTER_PLAN.md section E3 (evaluation metrics), E4 (E2E) and F7 (golden runs).

DO:
1. Apply the review fixes in order. After each fix, run the related tests.
2. eval/ideas.json with the 10 ideas from E3. Script npm run eval -- --limit N --repeat-first K, using Gemini and respecting the rate limit. It computes every automatic metric from the E3 table (first-try valid %, retry rate, stage failure rate, invalid-reference rate, cycle rate, coverage %, duplicate-task rate, tasks per story, edges per task, consistency CV for the repeats, run time, tokens) and writes eval/results/<date>_<model>.csv and .md. Run as many ideas as the free quota allows (at least 5; repeat idea 1 three times if possible). Report only measured numbers.
3. eval/rubric.md: a template for the team's 1–5 human scoring (5 criteria from E3, 2 raters per plan).
4. One Playwright E2E smoke test with LLM_PROVIDER=mock (idea → plan → download CSV and MD, then check the row count and that every T-code appears). Add it as a separate npm script; it is not part of CI.
5. Record golden runs with real Gemini for: "I want an online food delivery app", "Hospital appointment booking system" and "An app to help farmers".

CHECK: all tests pass; the eval .md table exists with real numbers; 3 golden JSON files exist in apps/web/public/golden.
FINISH: commit "feat: review fixes, evaluation results, E2E smoke, golden runs" (no AI trailers). Append to the progress log. Stop.
```

---

## STEP 10 · Sonnet · Deploy (Vercel + Render + Neon)

```text
Project D:\SPM. Read PROJECT_STATUS.md and ONLY MASTER_PLAN.md section F (F1–F7).

GOAL: a public deployment with a CI/CD pipeline. I will do every sign-up, login and secret entry myself. Never type credentials or keys into a website. Tell me exactly what to paste where, and wait for me.

DO:
1. Make the API production-ready: a start script from the compiled build, PORT from env, a /api/health check, trust proxy for the rate limiter, and CORS_ORIGIN set to the Vercel URL.
2. Write a render.yaml (or exact dashboard settings) for apps/api: build command, start command, health check path, and env var names (values left blank; I fill them in on Render).
3. Vercel settings for apps/web: root directory, build command, output directory, VITE_API_BASE_URL, and an SPA rewrite. The static golden plans must keep working even if the API is down.
4. .github/workflows/deploy.yml: on push to main, run CI, then run migrations against Neon (secret DATABASE_URL), then call the Render deploy hook (secret RENDER_DEPLOY_HOOK_URL).
5. docs/DEPLOYMENT.md: a step-by-step checklist for me (create the GitHub repo and push, connect Vercel, create the Render service, set env vars and secrets, run the first migration, warm up before the demo).
6. Guide me through it. After I confirm each part is live, verify: /api/health, one mock run, one Gemini run on production, golden fallback with the API stopped, and an export download.

FINISH: commit "chore: deployment config and docs" (no AI trailers). Put the live URLs in PROJECT_STATUS.md. Stop.
```

---

## STEP 11 · OPUS · Final check, viva pack and work split

```text
Project D:\SPM. Read PROJECT_STATUS.md, the eval results in eval/results/*.md, and docs/MASTER_PLAN.md sections A, B1, B4, E1 and G.

DO:
1. Final verification: tests pass, the production URLs work, and the golden fallback works. List anything not done, honestly.
2. README.md: what the project is, a feature list, an architecture diagram (Mermaid), how to run it locally (mock and Gemini), how to test, the deployment links, and the team.
3. docs/VIVA_NOTES.md, in simple English:
   - the problem, the 8 stages, and "AI generates, algorithms verify"
   - each algorithm with the 6-task worked example
   - the design flaws we found in our own deck and how we fixed them
   - the evaluation results (measured numbers only) and the limitations
   - 25 likely viva questions with short answers
4. docs/DEMO_SCRIPT.md: a 5-minute demo for sir, minute by minute, with a backup path if the internet or Gemini fails.
5. docs/WORK_SPLIT.md: divide the finished project EQUALLY among the 4 members (Generation layer, Scheduling & algorithms, Backend & data, Frontend & visualisation). For each part: the files they own, what they must be able to explain, and 5 questions they must answer.
6. Update PROJECT_STATUS.md: phase = complete, plus the next optional improvements.

FINISH: commit "docs: README, viva notes, demo script, work split" (no AI trailers). Stop.
```
