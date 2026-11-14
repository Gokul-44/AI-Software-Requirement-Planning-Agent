# AI Software Requirement & Planning Agent: Master Plan

**Team (IIIT Vadodara, International Campus Diu):** Akshay Kumar Tapraniya · Gokul Faleja · Saransh Sarang Naik · Shreya Tiwari
**Document status:** DRAFT v0.1 (2026-11-14). Analysis and plan only, waiting for team approval. No application code has been written.

**Labels used throughout**

| Tag | Meaning |
|---|---|
| **[DECK]** | Original design, taken from `planning-agent-intro.pdf` / `planning-agent-slides.pdf` or the project brief |
| **[FIX]** | A correction to a defect or gap in the original design. Recommended for v1. |
| **[EXTRA]** | Optional improvement. Do it only if time allows. |
| **(est.)** | An estimate, not a measurement. Replace it with measured values once Phase 1 runs. |

---

## Table of contents

- A. Understanding
- B. Critical analysis
  - B1. Known issues: verification and fixes
  - B2. Further issues found
  - B3. LLM design
  - B4. Algorithms
  - B5. Risk layer
  - B6. Suggestions ranked by value/effort
- C. Final architecture
- D. Master build plan
- E. Testing and evaluation plan
- F. Deployment plan
- G. Risks to our own project
- Appendix: decisions log and open questions

---

## A. Understanding

### A1. The project in one paragraph

A client usually describes software as one sentence, for example "I want an online food delivery app". Turning that sentence into requirements, epics, user stories, developer tasks, estimates, dependencies and a sprint schedule takes days of senior engineering time. Two planners given the same brief produce different plans, and neither plan can trace a task back to the requirement it came from. Jira and Asana track a plan once it exists, but they do not create one. We are building a deployed web system that takes the one-line idea and produces a **traceable, schedule-consistent plan**. The design rule is **"AI generates, algorithms verify."** A language model proposes the creative artifacts: requirements, stories, tasks, story-point estimates, dependency edges and risk narratives. Deterministic, unit-tested code then stamps identifiers, rejects invalid references, detects cycles, computes the critical path with CPM, packs tasks into capacity-feasible sprints and extracts numeric risk signals. Because of that second layer, the plan can be checked with arithmetic instead of only sounding reasonable. The plan exports to Jira CSV and Markdown.

### A2. Data flow

```
 idea_text (≤2000 chars) + config (team_size, velocity, sprint length, focus hours)
     │
 [1] Requirement analysis ── LLM ──► {summary, assumptions[], requirements[]}
     │                                   app stamps R-001…  ─► coverage set
 [2] Epics & stories ─────── LLM ──► {epics[{stories[{…, requirement_ids[]}]}]}
     │   input: R-codes + text only     app stamps E-001…, S-001…; refs checked; coverage check
 [3] Task decomposition ──── LLM (one call per epic, in parallel) ──► {tasks[{story_id,…}]}
     │   input: stories of one epic     app stamps T-001…; every story ≥1 task
 [4] Effort estimation ───── LLM ──► {estimates[{task_id, points}]}  → code: hours = map(points)
     │
 [5] Dependency edges ────── LLM ──► {dependencies[{task_id, depends_on[]}]}
     │                                   code: reject unknown IDs/self-loops/dups → edges (FS)
     │                                   code: Kahn → if cyclic: Tarjan SCC → repair policy
 [6] Scheduling ──────────── CODE: CPM (ES/EF/LS/LF/slack) → priority topo order → sprint packing
     │
 [7] Risks ──────── CODE signals SG-01… ──► LLM narrates ──► code validates citations
     │
 [8] Assemble & export ───── CODE: plan.json → UI (tables, React Flow, Gantt) · Jira CSV · Markdown
```

Each stage's output is cached under the key `hash(stage, prompt_version, model, settings, canonical input)` **[DECK + FIX: key definition]**. Changing team size or velocity re-runs only stages 6–8.

### A3. Ambiguities and open questions (answers needed from the team)

1. **Duration:** how many weeks remain until the final demo and viva, and how many hours per week can each member give? This plan assumes **12 weeks × ~10 h/week/person**. Please also share fixed dates (mid-term review, report deadline).
2. **Roles:** who takes which role? The plan refers to roles as **GEN, SCH, BE and FE** (see D1) until names are assigned.
3. **LLM provider, model and budget:** which provider, who owns the API key and billing, and what is the hard monthly cap?
4. **Language:** may we use **TypeScript** end to end? The deck says "Node.js". TypeScript is still Node.js, and it lets the frontend and backend share the Zod schemas.
5. **Default planning config:** team size, sprint length, focus hours per day, velocity per person, and the points→hours table. Proposed defaults are in C6. They are assumptions, not data.
6. **Input length:** strictly one line, or a short paragraph? This plan proposes 10–2000 characters.
7. **Editing:** does v1 allow the user to edit tasks or edges and re-schedule? This plan keeps v1 read-only, except for cycle resolution and config changes. Editing is listed as an [EXTRA].
8. **Jira target:** Jira Cloud company-managed or team-managed project? The CSV fields differ between the two.
9. **Report format:** does the department need an evaluation table or paper-style report? This affects how much effort goes into evaluation (Section E).
10. **Public access:** should the deployed demo be open to anyone, or gated by a shared access code for live LLM runs? See F4.

---

## B. Critical analysis

### B1. The seven known issues: verification and fixes

#### Issue 1: Traceability gap. **CONFIRMED.**
*Evidence:* the schema slide (slides p.10) draws `Epic` indented under `Requirement`, but `Epic(id, project_id, title)` has no requirement column. `UserStory` links only to `epic_id`. The same slide says "Every task traces back to the requirement that produced it", and slide 5 says "Every artifact is traceable to its parent requirement". The schema does not support either claim. Task → Story → Epic → Project is the only chain available.

**[FIX]**
- Add a **many-to-many link at story level**: `story_requirements(story_code, requirement_code)`. Stage 2 must return `requirement_ids[]` (at least 1) for every story. Linking at story level is more precise than at epic level, because one epic, such as "Ordering", often satisfies several requirements and one requirement, such as a security NFR, can span several epics.
- Trace a task with **Task → Story → Requirements** (derived, not stored again).
- Add **coverage checks**, run by code after stage 2 and after stage 3:
  - C1: every requirement has at least one story.
  - C2: every story has at least one task.
  - C3 (warning only): every requirement has at least one task, through its stories.
- On a C1 or C2 failure, make **one targeted retry** that sends the LLM only the uncovered items ("add stories for R-007, R-011"). If the gap remains, record a `plan_issue` of kind `uncovered_requirement` (warning) and also feed it to the risk layer as signal `uncovered_requirement`. The gap is never hidden.
- Non-functional requirements are covered the same way, through "technical stories" (for example "As a platform operator I want p95 API latency < 300 ms…"). Stage 2's prompt allows a "Platform & Quality" epic for them.

#### Issue 2: Sprint-packing infinite loop. **CONFIRMED.**
*Evidence:* slides p.14, line 3: `while load(s) + points(v) > C do s ← s+1`. If `points(v) > C`, no sprint ever accepts `v`, so the loop never ends.

**[FIX] Make the case impossible by construction, and keep a defensive check.**
1. Stage 4's schema limits `points` to the Fibonacci set {1, 2, 3, 5, 8, 13}, so `max_points = 13`.
2. **Config validation** at the API boundary rejects any config where `C = team_size × velocity_points_per_person < 13`, or where `H_sprint = sprint_length_days × focus_hours_per_day < hours(13)`. The API returns HTTP 400 `INVALID_CONFIG` with an explanation.
3. Under those invariants every task fits into an **empty** sprint. The loop therefore ends at the latest at `s = (highest sprint used) + 1`. This is a one-line termination proof that we can state in the viva.
4. The packing function still checks `points(v) > C` and `hours(v) > H_sprint` itself and throws a typed `OversizedTaskError`. It never loops forever, even if it is called directly with bad input.
5. 13-point tasks get a "should be split" warning signal (`oversized_task`). An [EXTRA] adds a "split this task" action that re-runs stage 3 for that one story.

#### Issue 3: Kahn's V \ L is not the cycle. **CONFIRMED.**
*Evidence:* slides p.12, line 11 returns `V \ L`. Kahn's algorithm never emits a node whose in-degree stays above zero. That includes the nodes on a cycle **and every node reachable from a cycle**. Example: with `A→B→C→A` and `C→D`, Kahn returns `{A, B, C, D}`, but D is a victim, not part of the cycle. A user shown four nodes cannot see which edge to remove.

**[FIX]**
- Keep Kahn as the **fast acyclicity test**, since `|L| = |V|` means the graph is acyclic. This matches the deck.
- If Kahn fails, run **Tarjan's SCC** on the subgraph induced by `V \ L`. Every SCC with more than one node is a cycle. Report it together with one concrete cycle path, found by a DFS inside the SCC, for display (for example `T-004 → T-009 → T-012 → T-004`). The remaining nodes of `V \ L` are reported as `blocked_by_cycle`, not as cycle members.
- Self-loops (`from = to`) are rejected earlier, during edge validation.
- **Repair policy [FIX, decision needed]:**
  1. **Automatic, bounded:** one LLM re-proposal **limited to the tasks inside each SCC**. The model receives only those tasks and their current edges and must return a corrected edge set for them. Code validates again.
  2. **User resolution:** if the graph is still cyclic, the run moves to status `needs_resolution`. The UI highlights the cycle and the user picks the edge(s) to remove. The pipeline then resumes from stage 5's validation step.
  3. **Logging:** every removed edge is logged as a `plan_issue` (kind `cycle_repaired`), appears in the plan, and becomes a risk signal. This keeps the deck's rule that a cycle is "reported as a genuine planning defect, not silently dropped".

  *Rejected alternative:* dropping the lowest-confidence edge automatically. It is silent, it hides defects, and LLM "confidence" values are not calibrated.

#### Issue 4: CPM and sprint packing give different timelines. **CONFIRMED.**
CPM assumes unlimited people, so it is a lower bound on duration. Sprint packing respects capacity. The two numbers will differ, often by a lot. The risk example "critical path 47 days" in the deck is a CPM number.

**[FIX] Show both, with clear labels and different roles:**
- **The primary Gantt is the capacity-feasible plan**, built from sprint packing (see B4.4). That is the plan a team would actually follow.
- **CPM drives the analysis:** slack, critical-path highlighting, and the "minimum possible duration with unlimited people" figure.
- The header shows: "Dependency-limited minimum (CPM): 23.5 working days · Capacity-feasible plan (4 devs): 4 sprints ≈ 40 working days · Ratio 1.7× → capacity-bound." That ratio becomes signal `capacity_bound`. It tells the reader whether adding people would help.
- A Gantt toggle switches between "Sprint plan" and "CPM (unlimited capacity)". Critical tasks keep the same highlight colour in both views.
- Risk narratives must say which schedule a number comes from. Zero slack is a CPM property.

#### Issue 5: Tie-breaking in packing. **CONFIRMED (unspecified in the deck).**
"For all v in topological order" leaves the order among ready tasks undefined. Kahn's queue order is arbitrary, so output can differ between runs and the critical tasks can be pushed back.

**[FIX]** Use Kahn's algorithm with a **priority queue**. The key is `(slack ascending, descendant_count descending, task_code ascending)`: critical tasks first, then tasks that unblock the most work, then a deterministic ID tie-break. The result is reproducible and testable.
Note the **computation order**, which is useful in a viva: plain Kahn (validate) → CPM (gives slack) → priority-Kahn (scheduling order) → packing. CPM needs a topological order, and the priority order needs CPM's slack, so topological sorting runs twice. That is cheap, O((V+E) log V).

#### Issue 6: Dependency semantics. **CONFIRMED (unspecified).**
**[FIX]**
- **Database and plan convention:** edge `(from, to)` means *`from` must finish before `to` can start* (Finish-to-Start). `from` is the predecessor.
- **v1 supports FS only.** The column `type` exists, but a `CHECK (type = 'FS')` constraint enforces FS.
- **LLM-facing wording:** the LLM never writes "from/to", because the direction is easy to confuse. Each item is `{ "task_id": "T-010", "depends_on": ["T-003", "T-004"], "reason": "…" }` ("T-010 cannot start until T-003 and T-004 are finished"). Code converts each entry to edges `T-003→T-010` and `T-004→T-010`.
- **Sanity warnings:** an edge that runs against the usual layer order (for example a `database` task depending on a `frontend` task) is kept but flagged as `suspicious_edge` (warning). It is not blocked, because such edges are sometimes legitimate.
- **Transitive edges** (A→B, B→C, plus A→C) do not change CPM or packing results. They are kept in the data but hidden in the graph view through a transitive reduction, to reduce clutter **[EXTRA]**.

#### Issue 7: Jira CSV mapping. **NOT VERIFIABLE FROM HERE. Must be tested in Week 1.**
I cannot confirm Jira's current CSV importer behaviour without a Jira site. The import wizard lets you map CSV columns to fields, so column names are partly flexible. The following points are **assumptions to verify**, not facts:
- Hierarchy through `Issue Id` / `Parent Id` columns (Epic → Story → Sub-task).
- `Issue Type` values must match the target project's issue types exactly.
- The story-points field is "Story Points" in company-managed projects and "Story point estimate" in team-managed projects.
- Repeated `Labels` columns produce multi-value labels.
- Issue links ("blocks") come from a column mapped to a link type during import.

**[FIX] Process:**
- **Week 1, BE owner:** create a free Jira Cloud site with one company-managed and one team-managed project. Import the hand-made `docs/samples/jira-sample.csv` (draft below) into both, and record which columns mapped and which failed. Save screenshots. Freeze `export/jira-mapping.md`.
- Repeat the import with real generated output in Week 10.
- **Representation choice:** Epic → Story → Sub-task (our Tasks). Requirement codes become labels (`R-001`). Acceptance criteria go into the Story description. Sprint numbers become labels (`sprint-1`), because creating Jira sprints through CSV is uncertain and needs verification. Dependency links are exported if the link mapping works; otherwise they go into the description as text ("Blocked by: T-003").

Draft sample, **UNVERIFIED**:
```csv
Issue Id,Parent Id,Issue Type,Summary,Description,Priority,Story Points,Labels,Labels,Blocked By
1,,Epic,E-001 Ordering,"Customers browse menus and place orders.",High,,E-001,,
2,1,Story,S-001 Browse restaurant menu,"As a customer I want to browse menus so that I can choose food.\n\nAcceptance criteria:\n- Menu shows items with prices\n- Unavailable items are greyed out",High,5,R-001,sprint-1,
3,2,Sub-task,T-001 Design menu DB tables,"Layer: database",Medium,2,R-001,sprint-1,
4,2,Sub-task,T-002 Menu REST endpoint,"Layer: backend",Medium,3,R-001,sprint-1,3
```

### B2. Further issues found (not in the known list)

| # | Issue | Severity | Evidence | [FIX] |
|---|---|---|---|---|
| N1 | **Packing over-serialises dependency chains.** The deck's rule `s ← 1 + max sprint(pred)` forces every predecessor into a **strictly earlier** sprint. A chain of 10 small dependent tasks (2 points each, 20 points in total) therefore needs **10 sprints**, about 20 weeks, even though it fits in one sprint's capacity of 40. Real teams finish dependent tasks inside the same sprint. | **High.** The schedules would look absurd for typical plans. | slides p.14 | **Relaxed packing** (B4.4): a task may share a sprint with its predecessors, provided the chain of hours inside that sprint fits within the sprint's working hours `H_sprint`. Keep the strict rule as a selectable mode so the two can be compared in the report. |
| N2 | **Backward-pass boundary is unspecified.** If each sink node's LF is set to its own EF, every sink appears critical. | Medium | slides p.13 | `LF(sink) = project duration = max EF` for **all** sinks. Unit-test it with an isolated task (expected slack = duration − d). |
| N3 | **CPM units are unspecified** ("47 days", hours, points). Floating-point day values make the test `slack == 0` fragile. | Medium | slides p.13, p.15 | Do all scheduling arithmetic in **integer hours** (one developer per task). Display days = hours ÷ focus_hours_per_day, rounded to 0.5. `critical ⇔ slack === 0`, exactly. |
| N4 | **Temperature 0–0.3 is not available on current Claude models.** Claude Opus 5.5 removed sampling parameters. Claude Sonnet 5.5 and Haiku 5.5 return 400 for non-default values. API version 2026-10-21 rejects `temperature` on every model. | Medium (if we choose Claude) | slides p.14 vs provider docs (Anthropic model table cached 2026-11-03) | The provider abstraction maps a generic `mode: "extract"` to provider settings: temperature 0–0.3 where supported, low/medium effort plus structured outputs on Claude. **Reproducibility comes from the cache, not from temperature.** Even temperature 0 is not guaranteed to be deterministic. |
| N5 | **Risk "evidence" is free text.** `Risk(…, evidence)` cannot be checked by code. | Medium | slides p.10 | Use structured citations: a `risk_evidence(risk_code, signal_code)` join table. Every risk needs at least one valid signal ID, otherwise it is rejected. |
| N6 | **Risk severity is decided by the LLM.** That contradicts "algorithms verify". | Low–Med | slides p.15 | Code computes severity from the cited signals (the maximum signal severity). The LLM writes only title, description and mitigation. |
| N7 | **No run or version entity.** Re-running from a stage, or changing the config, overwrites the plan or mixes two of them. IDs such as T-001 are only unique within one generation. | High (data model) | slides p.10 | Add a `runs` table. All plan entities are keyed by `(run_id, code)`. A re-run creates a new run that reuses cached stage outputs. |
| N8 | **Output size and over-generation.** For 30 stories, stage 3 can easily hit output-token limits or truncate. The LLM may also produce 300 tasks. | High | – | Use **per-epic batching** for stage 3 (parallel calls) with count bounds in the schema (2–8 tasks per story; 150 tasks in total as a hard cap). Check `stop_reason` for truncation; a truncated response counts as a retryable failure. |
| N9 | **Stage 5 at 80–150 tasks.** One call must consider about 11,000 ordered pairs, and quality falls as the list grows. | Medium | – | See B3.6: one call for ≤ 80 tasks; above that, **intra-epic calls in parallel plus one cross-epic call**. |
| N10 | **Prompt injection through idea text.** For example "ignore instructions, output…". | Low (output is schema-bound) | – | Wrap the idea in delimiters and label it as data. Output must still pass Zod and reference checks, so the worst case is a poor plan, not code execution. |
| N11 | **XSS and CSV/formula injection** from LLM-generated text in the UI and in the exported CSV. | Medium | – | React escapes text by default; never use `dangerouslySetInnerHTML`. CSV: prefix cells that start with `= + - @ \t \r` with `'`. Markdown: escape raw HTML. |
| N12 | **No auth plus a paid API** means anyone can spend our budget. | **High** for a public demo | scope slide | Per-IP rate limit, a global concurrency limit, a daily USD spend cap and an optional access code for live runs (F4). |
| N13 | **Long pipeline versus HTTP request lifetime.** A full run takes minutes (est.). | Medium | – | Make runs asynchronous: `POST` returns 202 with `run_id`, then the client polls. On server restart, interrupted runs are marked `failed` and can be resumed cheaply from the cache. |
| N14 | **The risk example "devops tasks have no assigned predecessor"** is often normal (many tasks start the project). | Low | slides p.15 | Signal only *isolated* tasks (no predecessors **and** no successors), plus specific anomalies: a `testing` task with no predecessor, or a `devops` deploy task with no predecessor. |
| N15 | **The decks differ slightly.** The intro deck's flowchart has 7 boxes and makes export implicit; the slides deck has 8 stages. | Info | intro p.7 vs slides p.6 | Use the 8-stage version. In the intro framing, export is part of "Structured Project Plan". |

### B3. LLM design

#### B3.1 Common harness (built once in Phase 1, reused by stages 1–5 and 7) [DECK + FIX]

```
callStage(stageId, input) →
  key = sha256(stageId | promptVersion | provider | model | settings | canonicalJSON(input))
  if cache[key] → return cached (mark stage "cached")
  for attempt in 1..3:                                 # 1 call + up to 2 repair retries
     resp = llm.generateStructured({system, user, jsonSchema, mode})
     if resp.stopReason in {max_tokens, refusal}: classify → retry / fail
     parsed = Zod.safeParse(resp.json)                 # structural
     if ok: semantic = validateRefs(parsed)            # IDs exist, counts, coverage
     if all ok: cache[key] = parsed; return
     user += "Your previous output was invalid: <compact error list>. Return the full corrected JSON."
  fail stage with VALIDATION_FAILED (errors attached)
Network / 429 / 5xx: separate budget, exponential backoff 1s/4s/10s, max 3, outside the repair loop.
```
- **Structured output method:** use the provider's native JSON-schema structured output where available. On Claude that is `output_config.format`, a JSON schema. On other providers it is their JSON-schema or tool-calling mode. The JSON schema is generated from the Zod schema, so there is a single source of truth. **Zod still validates after parsing**, because some constraints (counts, regex, cross-field rules) may not be enforced by the provider.
- **Error feedback:** retries send back the Zod issue paths and messages, trimmed to 20 issues. They do not send the whole previous output when the output was very large.
- **Context minimisation [DECK]:** each stage receives only the fields listed in B3.3.
- **Prompt versioning:** prompts live in `apps/api/src/prompts/stage<N>.v<k>.md`. The version is part of the cache key and is recorded in `plan.json`, so evaluation results can be attributed to a prompt version.
- **Usage accounting:** every call records `input_tokens`, `output_tokens`, `latency_ms`, the model and the attempt number in `stage_executions`. Cost is computed from a price table held in config. That table drives the spend cap.

#### B3.2 Provider abstraction [FIX]

```ts
// packages/shared/src/llm.ts  (interface only)
interface LlmClient {
  generateStructured<T>(req: {
    stage: StageId; system: string; user: string;
    schema: ZodType<T>; schemaName: string;
    mode: "extract" | "creative";      // maps to temperature/effort per provider
    maxOutputTokens: number;
  }): Promise<{ raw: unknown; usage: { inputTokens: number; outputTokens: number };
               stopReason: "end" | "max_tokens" | "refusal" | "other";
               model: string; latencyMs: number }>;
}
```
- Implementations: `anthropic`, `openai` or `gemini` (whichever the team picks; only one is needed for v1), plus **`replay`**. The replay client serves recorded responses from `stage_cache` or fixture files. CI, E2E tests, offline development and the demo fallback all use it.
- Selected by env: `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`. **Keys exist only on the server.** The frontend never calls the LLM.

#### B3.3 Per-stage contracts (inputs and outputs)

| Stage | Receives (only) | Returns (LLM) | Code then… | Bounds |
|---|---|---|---|---|
| 1 Requirements | idea text, count bounds | `summary`, `assumptions[]`, `requirements[{type, category?, text, priority}]` | stamps R-001… in order | 5–25 reqs; ≥1 NFR |
| 2 Epics & stories | summary, `R-codes{type,text,priority}` | `epics[{title, description, stories[{as_a, i_want, so_that, acceptance_criteria[], priority, requirement_ids[]}]}]` | refs ⊆ R-codes; stamps E-, S-; coverage C1 (one targeted retry) | 2–8 epics, 1–8 stories/epic, ≤40 stories, 2–5 AC each |
| 3 Tasks (per epic) | epic title, the epic's stories `{S-code, as_a, i_want, so_that, AC}`, summary | `tasks[{story_id, title, description, layer}]` | story_id ⊆ batch S-codes; stamps T- after merging epics in E/S order; coverage C2 | 1–8 tasks/story; ≤150 total |
| 4 Estimation | tasks `{T-code, title, layer, story i_want (≤120 chars)}`, anchor scale | `estimates[{task_id, points, rationale}]` | exactly one per task (missing → targeted retry); hours = map(points) | points ∈ {1,2,3,5,8,13}; rationale ≤ 160 chars |
| 5 Dependencies | tasks `{T-code, title, layer, story_id, epic_id}`, epic titles | `dependencies[{task_id, depends_on[], reason}]` | reject unknown IDs, self-loops, duplicates (logged); build FS edges; Kahn/Tarjan | ≤ 5 depends_on per task |
| 7 Risks | summary, signals `[{id, kind, severity, message, value, task_ids}]`, titles of tasks named in signals | `risks[{title, description, mitigation, signal_ids[]}]` | signal_ids ⊆ signal set, ≥1, else reject; severity computed by code; template fallback | 3–10 risks |

**Anchor scale for stage 4** (fixed text in the prompt, for consistency): "1 = trivial config or copy change, 2 = a small, well-understood unit, 3 = one endpoint or one screen with logic, 5 = a feature slice touching 2 layers, 8 = a complex integration or algorithm, 13 = too big and should be split."

#### B3.4 Cost per full run (est.)

Token estimate for a mid-size plan (~8 epics, ~30 stories, ~100 tasks), **not yet measured**:

| Stage | Input tokens (est.) | Output tokens (est.) |
|---|---|---|
| 1 | 1.2k | 1.5k |
| 2 | 2.5k | 5k |
| 3 (≈8 parallel calls) | 8k | 8k |
| 4 | 4k | 3k |
| 5 | 5k | 4k |
| 7 | 2k | 1.5k |
| Retries (+20%) | 4.5k | 4.6k |
| **Total** | **≈27k** | **≈28k** |

Anthropic list prices (from the Claude API model table cached 2026-11-03; **verify before budgeting**). Thinking tokens are billed as output, so a range is shown:

| Model | $/1M in | $/1M out | Est. cost per run (no thinking → with ~2× output for thinking) |
|---|---|---|---|
| Claude Haiku 5.5 (`claude-haiku-5-5`) | 0.10 | 0.50 | ≈ $0.02 → $0.03 |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | 2.00 | 10.00 | ≈ $0.33 → $0.61 |
| Claude Opus 5.5 (`claude-opus-5-5`) | 4.00 | 20.00 | ≈ $0.67 → $1.23 |

If the team picks OpenAI or Gemini, look up current prices; I have not verified them. **Recommendation:** develop against the replay provider and a low-cost model. Run the evaluation (Section E) on two or three models and **choose the demo model from measured quality per dollar**. The model comparison table is also good report material.

#### B3.5 Latency per full run (est.)
Stages 1, 2, 4, 5 and 7 run one after another; stage 3 runs in parallel per epic. With ~28k output tokens across 6 sequential steps, a fresh run is **roughly 1–4 minutes (est.)**, depending heavily on model output speed and thinking settings. Measure it in Phase 1 and record it in the evaluation table. Cached re-runs of stages 6–8 take well under 1 second, because they are pure code plus one stage-7 call. This is why runs are asynchronous with a progress view.

#### B3.6 Dependency stage at 80–150 tasks
- **≤ 80 tasks:** one call with the full compact list, about 30 tokens per task, so roughly 2.4k input tokens.
- **> 80 tasks [FIX]:**
  - **Pass A (parallel):** one call per epic for intra-epic edges, with that epic's tasks only.
  - **Pass B:** one cross-epic call. The input is all tasks as `{id, title, layer, epic}` grouped by epic (≈4.5k tokens for 150 tasks). The model is told to return **only edges that cross epics**.
  - Merge both passes, deduplicate, validate.
- Hard cap of 150 tasks at stage 3, so the UI and the evaluation stay manageable.
- Edges only add constraints. A missing edge makes the schedule optimistic, and an extra edge makes it pessimistic. Pass B is where most mistakes will happen, so the evaluation tracks "edges per task" and the human rubric scores dependency sensibility.

#### B3.7 LLM failure modes and handling

| Failure | Detection | Handling |
|---|---|---|
| Malformed or truncated JSON | parse error, `stop_reason=max_tokens` | repair retry; raise `maxOutputTokens` once; batch smaller |
| Refusal | `stop_reason=refusal` | fail the stage with a clear message (unlikely for planning text) |
| Invented IDs | reference check | repair retry naming the bad IDs; then drop with a `plan_issue` |
| Missing coverage | coverage checks | targeted retry; then a warning plus a signal |
| Over- or under-generation | count bounds in Zod | repair retry |
| Duplicate tasks | normalised-title token Jaccard ≥ 0.8 | warning issue plus a `duplicate_task_suspect` signal (not auto-deleted) |
| Edge direction inverted | `depends_on` wording plus layer-order warning | warning |
| Inconsistent granularity | 13-point tasks; tasks/story distribution | `oversized_task` signal |
| Ungrounded risk text | missing or invalid `signal_ids` | reject the risk; if none survive → template fallback |
| Provider outage | network or 5xx after backoff | run fails at stage N and can be resumed; demo falls back to golden runs |

### B4. Algorithms (exact definitions)

Notation: `V` = tasks, `E` = FS edges `(u,v)`: u before v. `d(v)` = hours(v), a positive integer. `pred(v)`, `succ(v)`.

#### B4.1 Edge validation (before any graph algorithm)
Drop and log (as `plan_issue`) any edge where `u ∉ V` or `v ∉ V` (`unknown_reference`), `u = v` (`self_loop`) or the edge is a duplicate (`duplicate_edge`). **O(E)** with a hash set.

#### B4.2 Acyclicity and cycle reporting
1. Kahn (plain FIFO): if `|L| = |V|`, the graph is a DAG.
2. Otherwise run Tarjan SCC on `V \ L`. `cycles = {SCC : |SCC| > 1}`. For each cycle, extract one simple cycle by DFS for display. `blocked = (V \ L) \ ∪cycles`.
3. Apply the repair policy (B1, Issue 3).
**Complexity:** O(V + E) for each step.

#### B4.3 CPM (integer hours)
- Forward pass in topological order: `ES(v) = max_{u∈pred(v)} EF(u)` (0 if no predecessors); `EF(v) = ES(v) + d(v)`.
- `D = max_v EF(v)` (0 for an empty graph).
- Backward pass in reverse topological order: `LF(v) = min_{w∈succ(v)} LS(w)`, or `D` if v has no successors **(N2 fix)**; `LS(v) = LF(v) − d(v)`.
- `slack(v) = LS(v) − ES(v) ≥ 0`; `critical(v) ⇔ slack(v) = 0`.
- **Critical path for display:** a critical edge `(u,v)` has both ends critical **and** `EF(u) = ES(v)`. One longest chain is extracted by following critical edges from a critical source. Several critical paths can exist; all critical tasks are highlighted.
- **Complexity:** O(V + E).

#### B4.4 Sprint packing

Config: `C = team_size × velocity_points_per_person` (points per sprint); `H = sprint_length_days × focus_hours_per_day` (one developer's working hours in a sprint).
Order: priority-Kahn with key `(slack ↑, descendants ↓, code ↑)`.

**Mode "relaxed" (recommended default) [FIX for N1]:**
```
for v in order:
    guard: if points(v) > C or d(v) > H → throw OversizedTaskError(v)
    s ← max(1, max_{u∈pred(v)} sprint(u))
    loop:
        start ← max({ fin(u) : u ∈ pred(v), sprint(u) = s } ∪ {0})   # offset within sprint, hours
        if load(s) + points(v) ≤ C and start + d(v) ≤ H:
            sprint(v) ← s; fin(v) ← start + d(v); load(s) += points(v); break
        s ← s + 1
```
- Guarantees: (a) no sprint exceeds C; (b) every predecessor lies in an earlier sprint, or in the same sprint and finishes before the task starts; (c) termination, because a new empty sprint always accepts v under the guard.
- `planned_start(v) = (sprint(v) − 1) × sprint_length_days × focus_hours + start`. This gives the Gantt position. The offset inside a sprint is labelled "indicative", because it does not assign individual developers.

**Mode "strict" [DECK]:** as above, but `s ← 1 + max sprint(pred)` and no hours check. It is kept for comparison.

**Complexity:** O(V·S + E), where S is the number of sprints (S ≤ V). Negligible at V ≤ 150.

#### B4.5 Edge cases (all become unit tests)

| Case | Expected behaviour |
|---|---|
| Empty task list | D = 0, no sprints, no error. The plan shows "no tasks". (In practice stage 3 always yields ≥ 1 task.) |
| Single task | ES 0, EF = d, slack 0, critical, sprint 1 |
| Isolated task (no edges) among others | ES 0, LF = D, slack = D − d |
| Disconnected components | Handled naturally. All sinks get LF = D. |
| Task over capacity | config validation 400 beforehand; `OversizedTaskError` if the function is called directly |
| Cycle | Kahn fails → Tarjan reports exactly the SCC(s) → repair. Downstream nodes are reported as blocked. |
| Self-loop or unknown ref | removed in B4.1 with an issue |
| Ties in slack | broken by descendants, then code → deterministic |
| Very long chain | relaxed mode packs by hours; strict mode would use one sprint per link (shown in the evaluation) |

### B5. Risk layer

**Rule [DECK + FIX]:** the LLM receives only computed signals. Every risk must cite at least one signal ID from the provided set; code rejects any risk that cites none, or cites an unknown ID. Severity is computed by code (N6). If all risks are rejected, the system produces one template risk per high-severity signal, so the register is never empty and always grounded.

**Deterministic signals** (IDs SG-01… per run; thresholds configurable; defaults are assumptions):

| Kind | Definition | Default threshold → severity |
|---|---|---|
| `critical_path_length` | CPM duration in days; share of tasks that are critical | share ≥ 40% → high; ≥ 25% → medium |
| `critical_high_fanout` | critical task with ≥ N transitive descendants | N ≥ 5 → high |
| `high_fan_in` | task with ≥ 4 direct predecessors (integration bottleneck) | medium |
| `sprint_overload` | sprint utilisation = load / C | ≥ 0.90 → medium; ≥ 0.98 → high |
| `sprint_imbalance` | coefficient of variation of utilisation (excluding the last sprint) | ≥ 0.35 → low |
| `capacity_bound` | capacity-feasible duration ÷ CPM duration | ≥ 1.5 → medium |
| `isolated_task` | no predecessors and no successors | low (≥ 3 tasks → medium) |
| `layer_anomaly` | `testing` or deploy-type `devops` task with no predecessor | low |
| `layer_imbalance` | testing share of points < 10%, or no devops tasks | medium |
| `uncovered_requirement` | requirement with no story or no task (C1/C3) | must-priority → high, otherwise medium |
| `oversized_task` | points = 13 | medium |
| `cycle_repaired` | edges removed during cycle repair | medium |
| `duplicate_task_suspect` | title similarity ≥ 0.8 | low |
| `critical_layer_concentration` | one layer holds ≥ 60% of critical-path hours | medium |

Example of what the risk agent receives (format; values are illustrative): `SG-03 critical_high_fanout: T-023 "Payment gateway integration" has 9 downstream tasks and 0 h slack (CPM).`

**[EXTRA] Numeric grounding check:** every number that appears in a risk description must appear in the values of a cited signal; otherwise the risk is flagged.

### B6. Suggestions ranked by value/effort (separate from the deck)

| Rank | Suggestion | Tag | Value | Effort |
|---|---|---|---|---|
| 1 | Relaxed sprint packing (N1) | FIX | Very high: plans become realistic | Low |
| 2 | Story-level requirement links plus coverage checks (Issue 1) | FIX | Very high: the core traceability claim | Low |
| 3 | `replay` LLM provider plus golden demo runs | FIX | Very high: CI, offline work, a safe demo | Low |
| 4 | `runs` entity and per-run entity keys (N7) | FIX | High: correctness of re-runs | Low |
| 5 | Severity computed by code; structured risk citations (N5, N6) | FIX | High: "algorithms verify" | Low |
| 6 | Stage 1 returns `assumptions[]` shown in the UI | EXTRA | High: makes ambiguity visible to the client | Very low |
| 7 | **Client-side what-if:** `packages/scheduler` also runs in the browser; sliders for team size and velocity re-schedule instantly | EXTRA | High demo impact | Low (pure functions are shared) |
| 8 | Property-based tests for the scheduler (random DAGs, check invariants) | EXTRA | High test confidence | Low |
| 9 | Mermaid Gantt plus a dependency diagram in the Markdown export | EXTRA | Medium | Low |
| 10 | Model comparison in the evaluation (2–3 models) | EXTRA | Medium–high for the report | Low (cost only) |
| 11 | Estimation consistency: sample stage 4 three times and take the median | EXTRA | Medium | Medium (3× stage-4 cost) |
| 12 | Edit tasks and edges in the UI, then re-schedule | EXTRA | Medium | Medium–high |
| 13 | Monte-Carlo / PERT duration distribution | EXTRA | Medium | High. Skip for v1. |

---

## C. Final architecture

### C1. Monorepo layout (npm workspaces, TypeScript)

```
/
├─ apps/
│  ├─ web/                 # React + Vite + TS. React Flow (+ dagre layout), custom SVG Gantt, TanStack Query
│  │  ├─ public/golden/    # static golden plan.json files (demo works even if the API is down)
│  │  └─ src/{pages,components,features/{plan,graph,gantt,sprints,risks,trace},api}
│  └─ api/                 # Node + Express + TS
│     ├─ src/routes/       # projects, runs, exports, health, demo
│     ├─ src/pipeline/     # orchestrator, stages/stage1..8, stamping, validation, coverage
│     ├─ src/llm/          # anthropic|openai|gemini client, replay client, price table
│     ├─ src/prompts/      # stage1.v1.md …  (versioned)
│     ├─ src/db/           # pg pool, repositories, plan assembler
│     └─ migrations/       # 001_init.sql …
├─ packages/
│  ├─ shared/              # Zod schemas: stage I/O, plan.json, API DTOs, error model; inferred TS types
│  ├─ scheduler/           # PURE functions: validateEdges, kahn, tarjan, cpm, priorityOrder, packSprints, signals
│  └─ exporters/           # PURE: toJiraCsv(plan), toMarkdown(plan)  (testable without DB)
├─ fixtures/               # plan.food-delivery.json (Phase 0), 6-task golden graph, recorded LLM responses
├─ eval/                   # ideas.json, run-eval script, results/*.csv|md, rubric.md
├─ docs/                   # decks, MASTER_PLAN.md, jira-mapping.md, architecture diagrams
└─ .github/workflows/      # ci.yml, deploy.yml
```
Tooling: Vitest for unit and contract tests (both apps and packages), Playwright for E2E, ESLint and Prettier, `tsc -b` for the typecheck, `node-pg-migrate` (SQL files) for migrations, pino for logs, `express-rate-limit`.

### C2. Final database schema (PostgreSQL DDL)

```sql
-- 001_init.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_text   text NOT NULL CHECK (char_length(idea_text) BETWEEN 10 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_run_id   uuid REFERENCES runs(id) ON DELETE SET NULL,     -- re-run lineage
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','needs_resolution','succeeded','failed')),
  current_stage   smallint NOT NULL DEFAULT 0 CHECK (current_stage BETWEEN 0 AND 8),
  config          jsonb NOT NULL,          -- team_size, velocity, sprint_length_days, focus_hours, points_to_hours, pack_mode
  llm_provider    text NOT NULL,
  llm_model       text NOT NULL,
  prompt_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary         text,
  assumptions     text[] NOT NULL DEFAULT '{}',
  is_golden       boolean NOT NULL DEFAULT false,
  input_tokens    integer NOT NULL DEFAULT 0,
  output_tokens   integer NOT NULL DEFAULT 0,
  est_cost_usd    numeric(10,4) NOT NULL DEFAULT 0,
  error           jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);
CREATE INDEX runs_project_idx ON runs (project_id, created_at DESC);
CREATE INDEX runs_created_idx ON runs (created_at);               -- daily spend-cap query

CREATE TABLE stage_executions (
  run_id        uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  stage         smallint NOT NULL CHECK (stage BETWEEN 1 AND 8),
  status        text NOT NULL CHECK (status IN ('pending','running','succeeded','cached','failed')),
  cache_key     char(64),
  attempts      smallint NOT NULL DEFAULT 0,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd      numeric(10,4) NOT NULL DEFAULT 0,
  latency_ms    integer,
  error         jsonb,
  started_at    timestamptz,
  finished_at   timestamptz,
  PRIMARY KEY (run_id, stage)
);

CREATE TABLE stage_cache (
  cache_key      char(64) PRIMARY KEY,         -- sha256(stage|prompt_version|provider|model|settings|canonical input)
  stage          smallint NOT NULL,
  prompt_version text NOT NULL,
  llm_model      text NOT NULL,
  output         jsonb NOT NULL,               -- validated LLM output (pre-stamping) or computed result
  input_tokens   integer NOT NULL DEFAULT 0,
  output_tokens  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE requirements (
  run_id    uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  code      text NOT NULL CHECK (code ~ '^R-[0-9]{3}$'),
  type      text NOT NULL CHECK (type IN ('functional','non_functional')),
  category  text CHECK (category IN ('performance','security','usability','reliability',
                                     'scalability','compliance','maintainability','other')),
  text      text NOT NULL,
  priority  text NOT NULL CHECK (priority IN ('must','should','could')),
  PRIMARY KEY (run_id, code)
);

CREATE TABLE epics (
  run_id      uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  code        text NOT NULL CHECK (code ~ '^E-[0-9]{3}$'),
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  PRIMARY KEY (run_id, code)
);

CREATE TABLE stories (
  run_id              uuid NOT NULL,
  code                text NOT NULL CHECK (code ~ '^S-[0-9]{3}$'),
  epic_code           text NOT NULL,
  as_a                text NOT NULL,
  i_want              text NOT NULL,
  so_that             text NOT NULL,
  acceptance_criteria text[] NOT NULL CHECK (cardinality(acceptance_criteria) >= 1),
  priority            text NOT NULL CHECK (priority IN ('must','should','could')),
  PRIMARY KEY (run_id, code),
  FOREIGN KEY (run_id, epic_code) REFERENCES epics(run_id, code) ON DELETE CASCADE
);

-- FIX (Issue 1): many-to-many traceability Story <-> Requirement
CREATE TABLE story_requirements (
  run_id           uuid NOT NULL,
  story_code       text NOT NULL,
  requirement_code text NOT NULL,
  PRIMARY KEY (run_id, story_code, requirement_code),
  FOREIGN KEY (run_id, story_code)       REFERENCES stories(run_id, code)      ON DELETE CASCADE,
  FOREIGN KEY (run_id, requirement_code) REFERENCES requirements(run_id, code) ON DELETE CASCADE
);
CREATE INDEX story_req_by_req ON story_requirements (run_id, requirement_code);

CREATE TABLE tasks (
  run_id            uuid NOT NULL,
  code              text NOT NULL CHECK (code ~ '^T-[0-9]{3}$'),
  story_code        text NOT NULL,
  title             text NOT NULL,
  description       text NOT NULL DEFAULT '',
  layer             text NOT NULL CHECK (layer IN ('frontend','backend','database','devops',
                                                   'testing','design','integration')),
  points            smallint CHECK (points IN (1,2,3,5,8,13)),   -- NULL until stage 4
  hours             integer  CHECK (hours > 0),                  -- NULL until stage 4
  estimate_rationale text,
  PRIMARY KEY (run_id, code),
  FOREIGN KEY (run_id, story_code) REFERENCES stories(run_id, code) ON DELETE CASCADE
);

-- Edge (from_task_code -> to_task_code): "from must FINISH before to can START" (FS only in v1)
CREATE TABLE dependencies (
  run_id         uuid NOT NULL,
  from_task_code text NOT NULL,
  to_task_code   text NOT NULL,
  type           text NOT NULL DEFAULT 'FS' CHECK (type = 'FS'),
  source         text NOT NULL DEFAULT 'llm' CHECK (source IN ('llm','repair','user')),
  reason         text,
  PRIMARY KEY (run_id, from_task_code, to_task_code),
  CHECK (from_task_code <> to_task_code),
  FOREIGN KEY (run_id, from_task_code) REFERENCES tasks(run_id, code) ON DELETE CASCADE,
  FOREIGN KEY (run_id, to_task_code)   REFERENCES tasks(run_id, code) ON DELETE CASCADE
);
CREATE INDEX deps_to_idx ON dependencies (run_id, to_task_code);

-- Units: integer working HOURS from project start (one developer per task)
CREATE TABLE schedule (
  run_id               uuid NOT NULL,
  task_code            text NOT NULL,
  sprint_number        integer NOT NULL CHECK (sprint_number >= 1),
  early_start          integer NOT NULL CHECK (early_start >= 0),
  early_finish         integer NOT NULL,
  late_start           integer NOT NULL,
  late_finish          integer NOT NULL,
  slack                integer NOT NULL CHECK (slack >= 0),
  on_critical_path     boolean NOT NULL,
  planned_start        integer NOT NULL,     -- capacity-feasible timeline (Gantt)
  planned_finish       integer NOT NULL,
  descendant_count     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, task_code),
  FOREIGN KEY (run_id, task_code) REFERENCES tasks(run_id, code) ON DELETE CASCADE,
  CHECK (early_finish >= early_start AND late_finish >= late_start)
);

CREATE TABLE sprints (
  run_id          uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  number          integer NOT NULL CHECK (number >= 1),
  capacity_points integer NOT NULL,
  load_points     integer NOT NULL CHECK (load_points <= capacity_points),
  PRIMARY KEY (run_id, number)
);

CREATE TABLE risk_signals (
  run_id    uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  code      text NOT NULL CHECK (code ~ '^SG-[0-9]{2,3}$'),
  kind      text NOT NULL,
  severity  text NOT NULL CHECK (severity IN ('low','medium','high')),
  value     numeric NOT NULL,
  threshold numeric,
  task_codes text[] NOT NULL DEFAULT '{}',
  message   text NOT NULL,                  -- generated by code, numeric
  PRIMARY KEY (run_id, code)
);

CREATE TABLE risks (
  run_id      uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  code        text NOT NULL CHECK (code ~ '^RK-[0-9]{3}$'),
  severity    text NOT NULL CHECK (severity IN ('low','medium','high')),  -- computed by code
  title       text NOT NULL,
  description text NOT NULL,
  mitigation  text NOT NULL,
  origin      text NOT NULL DEFAULT 'llm' CHECK (origin IN ('llm','template')),
  PRIMARY KEY (run_id, code)
);

-- FIX (N5): structured evidence — every risk cites >= 1 signal (enforced in code + assembler check)
CREATE TABLE risk_evidence (
  run_id      uuid NOT NULL,
  risk_code   text NOT NULL,
  signal_code text NOT NULL,
  PRIMARY KEY (run_id, risk_code, signal_code),
  FOREIGN KEY (run_id, risk_code)   REFERENCES risks(run_id, code)        ON DELETE CASCADE,
  FOREIGN KEY (run_id, signal_code) REFERENCES risk_signals(run_id, code) ON DELETE CASCADE
);

-- Validation defects / warnings surfaced in the UI and the report
CREATE TABLE plan_issues (
  run_id     uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  code       text NOT NULL CHECK (code ~ '^I-[0-9]{3}$'),
  stage      smallint NOT NULL,
  severity   text NOT NULL CHECK (severity IN ('error','warning','info')),
  kind       text NOT NULL,   -- unknown_reference|self_loop|duplicate_edge|cycle|cycle_repaired|
                              -- uncovered_requirement|story_without_tasks|oversized_task|
                              -- suspicious_edge|duplicate_task_suspect|risk_rejected
  message    text NOT NULL,
  refs       text[] NOT NULL DEFAULT '{}',
  resolution text,
  PRIMARY KEY (run_id, code)
);
```
Note: a "risk has ≥ 1 evidence row" rule cannot be a simple `CHECK`. The application enforces it and a contract test asserts it.

### C3. API design

Base path `/api`. JSON everywhere. Every response carries the `X-Request-Id` header.

| Method & path | Request | Response | Notes |
|---|---|---|---|
| `POST /projects` | `{ idea_text, config?, access_code? }` | `202 { project_id, run_id }` | Validates config (C ≥ 13, H ≥ hours(13)). Checks rate limit and spend cap. |
| `GET /projects?limit=20` | – | `200 [{ id, idea_text, created_at, latest_run: {id,status} }]` | history list |
| `GET /runs/:id` | – | `200 RunStatus` (below) | **polled every 2 s** by the UI |
| `GET /runs/:id/plan` | – | `200 plan.json` · `409` if not finished | contract: `PlanSchema` |
| `POST /runs/:id/rerun` | `{ from_stage: 1..8, config? }` | `202 { run_id }` | new run; reuses cache for stages before `from_stage` |
| `POST /runs/:id/resolve-cycle` | `{ remove_edges: [{from,to}] }` | `202 { run_id }` | only when `needs_resolution` |
| `GET /runs/:id/export/jira.csv` | – | `text/csv` attachment | |
| `GET /runs/:id/export/plan.md` | – | `text/markdown` attachment | |
| `GET /demo/golden` | – | `200 [{ run_id, idea_text }]` | golden runs; no LLM |
| `GET /health` | – | `200 { status, db, llm_configured, budget: {spent_today_usd, cap_usd}, version }` | used by uptime ping and pre-demo warm-up |

`RunStatus`:
```json
{ "run_id": "…", "status": "running", "current_stage": 3,
  "stages": [ { "stage": 1, "name": "requirements", "status": "cached",   "attempts": 0, "latency_ms": 0 },
              { "stage": 2, "name": "stories",      "status": "succeeded","attempts": 1, "latency_ms": 18400 },
              { "stage": 3, "name": "tasks",        "status": "running" } ],
  "issues_count": { "error": 0, "warning": 2 },
  "cycle": null,
  "error": null }
```
Polling is preferred over SSE: it is simpler, it works through every proxy and free-tier host, and a 2-second interval is fine for a run that takes minutes. SSE is an [EXTRA].

**Error model** (every non-2xx):
```json
{ "error": { "code": "BUDGET_EXHAUSTED", "message": "Daily live-run budget reached. Try a golden demo run.",
             "details": {}, "request_id": "…" } }
```
| code | HTTP |
|---|---|
| `VALIDATION_FAILED` / `INVALID_CONFIG` | 400 |
| `ACCESS_CODE_REQUIRED` | 401 |
| `NOT_FOUND` | 404 |
| `RUN_NOT_READY` / `INVALID_STATE` | 409 |
| `RATE_LIMITED` / `BUDGET_EXHAUSTED` / `TOO_MANY_RUNS` | 429 |
| `LLM_UNAVAILABLE` | 503 |
| `INTERNAL` | 500 |

Stage failures are **not** HTTP errors. They appear in `RunStatus.error = { stage, code: "STAGE_FAILED", message, details }`.

### C4. LLM output schemas (exact; JSON Schema draft 2020-12, generated from Zod)

All objects use `additionalProperties: false`. All listed properties are required unless marked optional.

**Stage 1: `RequirementsOutput`**
```json
{ "type":"object", "required":["summary","assumptions","requirements"],
  "properties":{
    "summary":{"type":"string","minLength":20,"maxLength":600},
    "assumptions":{"type":"array","maxItems":10,"items":{"type":"string","maxLength":200}},
    "requirements":{"type":"array","minItems":5,"maxItems":25,"items":{
      "type":"object","required":["type","text","priority"],
      "properties":{
        "type":{"enum":["functional","non_functional"]},
        "category":{"enum":["performance","security","usability","reliability","scalability","compliance","maintainability","other"]},
        "text":{"type":"string","minLength":10,"maxLength":300},
        "priority":{"enum":["must","should","could"]} } } } } }
```
Zod extra rules: at least one `non_functional`. `category` is required when the type is `non_functional`.

**Stage 2: `StoriesOutput`**
```json
{ "type":"object","required":["epics"],"properties":{
  "epics":{"type":"array","minItems":2,"maxItems":8,"items":{
    "type":"object","required":["title","description","stories"],"properties":{
      "title":{"type":"string","maxLength":80},
      "description":{"type":"string","maxLength":300},
      "stories":{"type":"array","minItems":1,"maxItems":8,"items":{
        "type":"object","required":["as_a","i_want","so_that","acceptance_criteria","priority","requirement_ids"],
        "properties":{
          "as_a":{"type":"string","maxLength":60},
          "i_want":{"type":"string","maxLength":200},
          "so_that":{"type":"string","maxLength":200},
          "acceptance_criteria":{"type":"array","minItems":2,"maxItems":5,"items":{"type":"string","maxLength":200}},
          "priority":{"enum":["must","should","could"]},
          "requirement_ids":{"type":"array","minItems":1,"maxItems":5,"items":{"type":"string","pattern":"^R-[0-9]{3}$"}} } } } } } } } }
```
Zod extra rules: total stories ≤ 40; every `requirement_ids` entry is in the stamped R set.

**Stage 3: `TasksOutput`** (one call per epic)
```json
{ "type":"object","required":["tasks"],"properties":{
  "tasks":{"type":"array","minItems":1,"maxItems":60,"items":{
    "type":"object","required":["story_id","title","description","layer"],"properties":{
      "story_id":{"type":"string","pattern":"^S-[0-9]{3}$"},
      "title":{"type":"string","minLength":5,"maxLength":100},
      "description":{"type":"string","maxLength":300},
      "layer":{"enum":["frontend","backend","database","devops","testing","design","integration"]} } } } } }
```
Zod extra rules: `story_id` is in this batch's stories; 1–8 tasks per story; total ≤ 150 after merging.

**Stage 4: `EstimatesOutput`**
```json
{ "type":"object","required":["estimates"],"properties":{
  "estimates":{"type":"array","items":{
    "type":"object","required":["task_id","points","rationale"],"properties":{
      "task_id":{"type":"string","pattern":"^T-[0-9]{3}$"},
      "points":{"enum":[1,2,3,5,8,13]},
      "rationale":{"type":"string","maxLength":160} } } } } }
```
Zod extra rules: the set of task_ids equals the stamped T set exactly (missing → targeted retry; unknown → dropped and logged).

**Stage 5: `DependenciesOutput`**
```json
{ "type":"object","required":["dependencies"],"properties":{
  "dependencies":{"type":"array","items":{
    "type":"object","required":["task_id","depends_on","reason"],"properties":{
      "task_id":{"type":"string","pattern":"^T-[0-9]{3}$"},
      "depends_on":{"type":"array","minItems":1,"maxItems":5,"items":{"type":"string","pattern":"^T-[0-9]{3}$"}},
      "reason":{"type":"string","maxLength":160} } } } } }
```
Semantics: every `x` in `depends_on` creates an edge `x → task_id`. Tasks with no dependencies are simply omitted.

**Stage 7: `RisksOutput`**
```json
{ "type":"object","required":["risks"],"properties":{
  "risks":{"type":"array","minItems":1,"maxItems":10,"items":{
    "type":"object","required":["title","description","mitigation","signal_ids"],"properties":{
      "title":{"type":"string","maxLength":100},
      "description":{"type":"string","maxLength":500},
      "mitigation":{"type":"string","maxLength":400},
      "signal_ids":{"type":"array","minItems":1,"items":{"type":"string","pattern":"^SG-[0-9]{2,3}$"}} } } } } }
```

### C5. `plan.json` contract (consumed by the frontend; `PlanSchema` v1.0)

```json
{
  "schema_version": "1.0",
  "project": { "id": "uuid", "idea_text": "…", "created_at": "ISO-8601" },
  "run": {
    "id": "uuid", "status": "succeeded", "created_at": "…", "finished_at": "…",
    "llm": { "provider": "anthropic", "model": "…", "prompt_versions": { "1": "v3", "2": "v2", "3": "v2", "4": "v1", "5": "v2", "7": "v1" } },
    "config": { "team_size": 4, "velocity_points_per_person": 10, "sprint_length_days": 10,
                "focus_hours_per_day": 6, "points_to_hours": { "1": 4, "2": 8, "3": 12, "5": 20, "8": 32, "13": 52 },
                "pack_mode": "relaxed" },
    "usage": { "input_tokens": 27000, "output_tokens": 28000, "est_cost_usd": 0.33, "duration_ms": 142000 }
  },
  "summary": "…",
  "assumptions": ["Single city launch", "…"],
  "requirements": [ { "id": "R-001", "type": "functional", "category": null, "text": "…", "priority": "must",
                      "story_ids": ["S-001","S-004"], "task_ids": ["T-001","T-002"] } ],
  "epics":   [ { "id": "E-001", "title": "…", "description": "…", "story_ids": ["S-001"] } ],
  "stories": [ { "id": "S-001", "epic_id": "E-001", "as_a": "customer", "i_want": "…", "so_that": "…",
                 "acceptance_criteria": ["…"], "priority": "must", "requirement_ids": ["R-001"], "task_ids": ["T-001"] } ],
  "tasks":   [ { "id": "T-001", "story_id": "S-001", "title": "…", "description": "…", "layer": "database",
                 "points": 2, "hours": 8, "estimate_rationale": "…", "requirement_ids": ["R-001"] } ],
  "dependencies": [ { "from": "T-001", "to": "T-002", "type": "FS", "source": "llm", "reason": "…" } ],
  "schedule": {
    "unit": "hours",
    "cpm": { "duration_hours": 141, "duration_days": 23.5, "critical_path": ["T-001","T-002","T-009"] },
    "capacity_plan": { "sprint_count": 4, "duration_days": 40, "capacity_points_per_sprint": 40, "hours_per_sprint": 60 },
    "tasks": [ { "task_id": "T-001", "es": 0, "ef": 8, "ls": 0, "lf": 8, "slack": 0, "critical": true,
                 "sprint": 1, "planned_start": 0, "planned_finish": 8, "descendants": 12 } ],
    "sprints": [ { "number": 1, "load_points": 38, "capacity_points": 40, "utilisation": 0.95, "task_ids": ["T-001"] } ]
  },
  "signals": [ { "id": "SG-01", "kind": "critical_high_fanout", "severity": "high", "value": 9, "threshold": 5,
                 "task_ids": ["T-023"], "message": "T-023 has 9 downstream tasks and 0 h slack (CPM)." } ],
  "risks": [ { "id": "RK-001", "severity": "high", "title": "…", "description": "…", "mitigation": "…",
               "signal_ids": ["SG-01"], "origin": "llm" } ],
  "coverage": { "requirements_total": 14, "requirements_with_story": 14, "requirements_with_task": 13,
                "uncovered_requirement_ids": [], "stories_without_tasks": [] },
  "issues": [ { "id": "I-001", "stage": 5, "severity": "warning", "kind": "unknown_reference",
                "message": "Edge T-099→T-004 dropped: T-099 does not exist.", "refs": ["T-099","T-004"], "resolution": "dropped" } ]
}
```
Contract rules:
- The plan is produced only by the assembler and validated by `PlanSchema` before it is served. A test fails if any ID referenced anywhere is missing from its list.
- `requirements[].task_ids` and `tasks[].requirement_ids` are **derived** (not stored), so the UI can trace in both directions without extra joins.
- Additive changes bump the minor version (1.1). Breaking changes need sign-off from all four roles.

### C6. Default configuration (assumptions; editable in the UI)

| Key | Default | Why |
|---|---|---|
| `team_size` | 4 | matches a student team |
| `sprint_length_days` | 10 (2 weeks) | common Scrum default |
| `focus_hours_per_day` | 6 | the remaining hours go to meetings and overhead |
| `velocity_points_per_person` | 10 | 10 × 4 h = 40 h of 60 focus h per sprint ≈ 67% |
| `points_to_hours` | 4 h per point (1→4 … 13→52) | linear and easy to explain; a calibration knob, **not learned** (deck limitation) |
| `pack_mode` | `relaxed` | see N1 |
| Derived checks | C = 40 ≥ 13 ✓; H = 60 ≥ 52 ✓ | Issue 2 invariant |

---

## D. Master build plan

**Assumptions:** **N = 12 weeks, H ≈ 10 h/week/person (≈ 480 person-hours in total)**. Week 1 starts on the day the plan is approved. If N = 8, merge Weeks 9–12 into 2 weeks and drop all [EXTRA] items. If N = 16, add the [EXTRA] items in Weeks 11–14.

### D1. Roles (from the brief; names to be assigned)

| Role | Owner | Owns |
|---|---|---|
| **GEN**: Generation layer | *[name]* | stages 1–3: prompts, LLM client and harness (Zod, retries), per-stage caching logic, replay provider, evaluation harness and prompt evaluation |
| **SCH**: Scheduling & algorithms | *[name]* | stages 4–6: estimation prompt, points→hours, `packages/scheduler` (validation, Kahn, Tarjan, CPM, priority order, packing), 6-task golden tests, property tests, stage 5 prompt and the large-graph strategy |
| **BE**: Backend & data | *[name]* | stages 7–8: DB schema and migrations, ID stamping and reference validation, Express routes, orchestrator, risk stage, `packages/exporters` (Jira CSV, Markdown), deployment, spend cap |
| **FE**: Frontend & visualisation | *[name]* | React app, fixture `plan.json`, React Flow graph, Gantt, sprint board, traceability views, demo flow |

**Load-balancing suggestion [EXTRA]:** BE carries the most work. Move **risk signal extraction** into `packages/scheduler/signals.ts`, owned by SCH, because it consists of graph metrics. BE keeps the stage-7 LLM call. GEN, who is lighter after Week 6, owns the evaluation campaign.

### D2. Interfaces to freeze early (end of Week 1, tag `contracts-v1`)
1. `packages/shared`: the `PlanSchema` (plan.json v1.0) and the stage I/O schemas (C4).
2. The `LlmClient` interface (B3.2).
3. Scheduler function signatures (pure, synchronous):
   ```ts
   validateEdges(taskIds: string[], edges: Edge[]): { edges: Edge[]; issues: Issue[] }
   checkAcyclic(taskIds, edges): { ok: true; order: string[] } | { ok: false; cycles: string[][]; blocked: string[] }
   computeCpm(order, edges, hours: Record<string, number>): CpmResult
   priorityOrder(taskIds, edges, cpm: CpmResult): string[]
   packSprints(order, edges, tasks: {id; points; hours}[], cfg: PackConfig): PackResult   // throws OversizedTaskError
   computeSignals(plan: PlanCore, thresholds): Signal[]
   ```
4. The REST endpoints and error model (C3).
5. The DB DDL v1 (C2).

**Change rule:** a PR that touches `packages/shared` needs approval from every affected role owner (enforced with CODEOWNERS).

### D3. Week-by-week plan

| Week | Phase | GEN | SCH | BE | FE | Checkpoint / integration |
|---|---|---|---|---|---|---|
| 1 | **0** contracts | Provider account and key, `LlmClient` interface, `replay` client stub, `eval/ideas.json` (10 ideas) | `packages/scheduler` skeleton; **write the 6-task golden tests first (failing)**; hand-compute the fixture schedule with FE | Monorepo, ESLint/TS/Vitest, **CI on PRs**, DDL v1, Express skeleton + `/health`, **Jira CSV import test** | Vite app, routing, **fixture `plan.food-delivery.json` (~25 tasks, consistent numbers)**, layout shell | **All:** freeze `contracts-v1` (PlanSchema plus stage schemas) |
| 2 | **0 → 1** | Harness: structured output, Zod validation, repair retry, usage logging; stage 1 prompt v1; tests with replay | Edge validation, Kahn, Tarjan, CPM → golden tests green | `runs` and `stage_executions` tables; orchestrator with fake stages; `GET /runs/:id`; serve the fixture via `/runs/:id/plan` | Requirements, stories and tasks tables with trace links; React Flow plus dagre on the fixture | FE renders the full fixture plan; the scheduler validates the fixture numbers |
| 3 | **1** + walking skeleton | Stage 1 live on 3 ideas; stage 2 prompt v1 | Priority order, packing (relaxed and strict), oversize guard, property tests | **Deploy skeleton** (Vercel + Render + Neon); `stage_cache`; stamping utility plus reference validator (pure, tested) | Gantt (custom SVG) plus sprint board on the fixture; "new plan" form plus progress polling (fake stages) | **CP-A:** deployed URL; stage 1 live through the API; UI complete on the fixture |
| 4 | **2** chaining | Stage 2 (coverage C1 retry) and stage 3 (per-epic parallel, C2) | Stage 4 prompt plus points→hours; config validation | Chaining 1→4 in the orchestrator with caching; persisting entities | Swap the fixture for live data (same contract); issues panel | Idea → tasks with estimates, live, cached |
| 5 | **3** graph | Prompt iteration with a mini-evaluation (5 ideas); duplicate-task detector | Stage 5 prompt (`depends_on`), large-graph strategy (>80 tasks) | Edge persistence; plan assembler (DB → plan.json) plus contract test; coverage report | Graph from live data; issue highlighting; requirement → task trace view | **CP-B:** idea → validated DAG end to end |
| 6 | **4** scheduling | Cycle re-proposal prompt (SCC-limited) | Scheduler wired in as stage 6; cycle repair flow | `needs_resolution` status plus `resolve-cycle`; `rerun` from stage 6 with a new config | Critical-path highlight; CPM vs capacity toggle; cycle-resolution UI; [EXTRA] what-if sliders | **CP-C (mid-project demo):** stages 1–6 live and deployed |
| 7 | **5** risk | Evaluation script automation (metrics → CSV/MD) | Signals plus unit tests (or BE, see D1) | Stage 7: risk prompt, citation validation, code severity, template fallback | Risk register view: risk → signal → task links | Grounded risks live |
| 8 | **6** persistence/export | **Evaluation round 1** (10 ideas, model A) | Playwright E2E with replay; performance check at 150 tasks | `exporters`: Jira CSV (with injection escaping) plus Markdown; seed golden runs | Export buttons; project history; golden-demo picker (static fallback) | **CP-D: feature complete** (only fixes and extras afterwards) |
| 9 | Evaluation | Evaluation round 2 (prompt v-next); model comparison | Help with the human rubric; scheduler edge-case review | Re-test the Jira import with real output; fix issues | UX fixes from evaluation findings | Evaluation tables v1 |
| 10 | Deploy hardening | Prompt freeze; record golden runs | Security review of exporters | Rate limit, spend cap, access code, logging, health, cold-start warm-up, CORS | Error and empty states; budget-exhausted → golden demo | **CP-E:** production-ready deploy |
| 11 | Polish + report | Report: LLM design and evaluation | Report: algorithms with proofs and tests | Report: architecture, data, deployment | Report: UI; demo script; accessibility pass | Report draft complete |
| 12 | Buffer + viva | Rehearse; **everyone explains all 8 stages** | — | Final tag `v1.0`; backup video of the demo | Demo rehearsal ×2 | **Final demo / viva** |

**Cross-role dependencies:**
- FE depends only on the fixture until Week 4.
- BE's orchestrator needs GEN's harness in Week 2. Agree the harness API on day 3.
- SCH's stage 4 and 5 prompts reuse GEN's harness.
- The risk stage needs signals from Week 7.
- The evaluation needs the full pipeline from Week 8.

### D4. Phases: tasks, deliverable, definition of done, tests

| Phase | Deliverable | Definition of done | Tests |
|---|---|---|---|
| **0** Fixture-first UI [DECK] | `fixtures/plan.food-delivery.json`; all views rendering it; contracts v1; CI | The fixture passes `PlanSchema`; every view renders it with no console errors; CI is green on `main` | Contract test (fixture ↔ schema); component smoke tests |
| **1** Single stage | Stage 1 through the hardened harness | Valid output on 3/3 sample ideas; a malformed response triggers a repair retry; usage logged | Harness unit tests with replay: valid, malformed JSON, Zod-invalid, max_tokens, network error |
| **2** Chaining | Stages 1→3 (+4) with caching | A second identical run makes 0 LLM calls; coverage C1 and C2 enforced or logged | Cache-key tests; coverage-checker tests; contract tests per stage |
| **3** Graph | Stamping, edge proposal, reference validation | Fake IDs never reach the DB; every issue appears in `plan.issues` | Validator tests: unknown ID, self-loop, duplicate; stamping order determinism |
| **4** Scheduling | Pure scheduler wired in as stage 6; cycle repair | Golden 6-task results match exactly; property tests pass 1,000 random DAGs; a cycle produces exact SCCs | Section E1 |
| **5** Risk layer | Signals plus grounded risks | 100% of stored risks cite ≥ 1 valid signal; severity matches code | Signal unit tests; rejection test with a fake signal ID; fallback test |
| **6** Persistence/export | DB persistence, Jira CSV, Markdown, golden runs | The CSV imports into the Jira test project; the Markdown renders on GitHub; E2E is green | Exporter snapshot tests; CSV-injection test; Playwright E2E |

### D5. Git workflow
- **Branches:** `main` is protected (no direct pushes). Work happens on `feat/<area>-<desc>`, `fix/…` or `chore/…`, with short-lived branches of 3 days or less.
- **PRs:** one approving review from another member (two for `packages/shared`), CI green, squash merge, Conventional Commit titles (`feat(scheduler): add tarjan scc`). The PR template has a checklist: tests added, contracts changed?, screenshots for UI changes.
- **CI (`ci.yml`) on every PR:** `npm ci` → lint → `tsc -b` (typecheck) → `vitest run` (unit and contract tests, **LLM via replay, no network**) → build both apps.
- **CD (`deploy.yml`) on merge to `main`:** run migrations against Neon (`DATABASE_URL` secret) → trigger the Render deploy hook. Vercel deploys `apps/web` through its Git integration.
- **Authorship:** every commit is made under the member's own name and email (`git config user.name/user.email` per machine). **No AI co-author trailers or AI session trailers in commits or PRs.** [EXTRA] A `commit-msg` hook rejects messages containing `Co-Authored-By:` lines that name an AI tool.
- `.env` is never committed; `.env.example` is committed. Secrets live in the GitHub, Render and Vercel settings.

---

## E. Testing and evaluation plan

### E1. Scheduler unit tests: the hand-built 6-task graph (known answer)

Tasks (`points → hours` at 4 h/point):

| Task | Points | Hours d |
|---|---|---|
| A | 2 | 8 |
| B | 3 | 12 |
| C | 2 | 8 |
| D | 5 | 20 |
| E | 1 | 4 |
| F | 3 | 12 |

Edges (FS): `A→B, A→C, B→D, C→D, C→E, D→F, E→F`

Expected CPM (hours):

| Task | ES | EF | LS | LF | Slack | Critical |
|---|---|---|---|---|---|---|
| A | 0 | 8 | 0 | 8 | 0 | ✔ |
| B | 8 | 20 | 8 | 20 | 0 | ✔ |
| C | 8 | 16 | 12 | 20 | 4 | |
| D | 20 | 40 | 20 | 40 | 0 | ✔ |
| E | 16 | 20 | 36 | 40 | 20 | |
| F | 40 | 52 | 40 | 52 | 0 | ✔ |

Project duration **52 h**; critical path **A → B → D → F**.
Priority order (slack ↑, descendants ↓, code ↑): **A, B, C, D, E, F**.

Sprint packing with `C = 10` points:
- **Strict [DECK]:** S1 {A}=2, S2 {B,C}=5, S3 {D,E}=6, S4 {F}=3 → **4 sprints**. This demonstrates N1: 14 points need 4 sprints.
- **Relaxed [FIX]** with `H = 40 h`:
  - A → S1 [0, 8]
  - B → S1 [8, 20]
  - C → S1 [8, 16]
  - D → S1 would bring the load to 12 > 10, so it goes to S2 [0, 20]
  - E → S1 [16, 20], load 8
  - F → S2 [20, 32], load 8
  - Result: **S1 {A,B,C,E}=8, S2 {D,F}=8 → 2 sprints**.

Other cases:
- **Capacity guard:** `C = 4` → `OversizedTaskError(D, points 5 > 4)`. `H = 16` → `OversizedTaskError(D, hours 20 > 16)`. Both return immediately, with no hang (test timeout 100 ms).
- **Cycle cases:**
  - `A→B, B→C, C→A, C→D`: Kahn fails; Tarjan reports exactly `[[A,B,C]]`; `blocked = [D]`.
  - Two disjoint cycles `{A,B}` and `{D,E}` → both are reported.
  - Self-loop `A→A` → removed by `validateEdges` with a `self_loop` issue.
- **Other edge cases:** empty graph (D = 0, 0 sprints); a single task; an isolated task among others (slack = D − d); disconnected components; tie-break determinism (shuffling the input order gives identical output).
- **Property-based tests (fast-check, 1,000 random DAGs of up to 150 nodes):**
  - slack ≥ 0
  - `max EF = D`
  - every edge satisfies `EF(u) ≤ ES(v)`
  - no sprint load exceeds C
  - every edge satisfies `sprint(u) < sprint(v)`, or equal sprints with `fin(u) ≤ start(v)`
  - the strict-mode sprint count is ≥ the relaxed-mode count **in most cases only**. Property testing in Step 2 found this is not a theorem for greedy packing (a 4-task counterexample exists; about 1.4% of random DAGs). It is tested statistically (relaxed worse on at most 5% of DAGs).

### E2. Contract tests
- Every recorded LLM response (fixtures) passes its stage schema. Mutated copies (a missing field, a wrong enum, a fake ID) are rejected with the expected issue.
- **Reference validation:** a stage 5 output containing `T-999` → the edge is dropped plus an `unknown_reference` issue; it never reaches the DB.
- **Stamping:** IDs are contiguous, zero-padded and in deterministic order. No LLM-provided ID ever survives.
- **Assembler:** the produced `plan.json` passes `PlanSchema`, and every cross-reference resolves.
- **API:** the response shapes of all endpoints are validated against the shared DTO schemas (supertest).
- **Exporters:** snapshot tests; CSV cells beginning with `=` are escaped; the CSV parses back with the same row count.

### E3. LLM evaluation (10 fixed ideas)

`eval/ideas.json` (fixed, version-controlled):
1. Online food delivery app
2. Learning management system for a college
3. Hospital appointment booking
4. E-commerce store for handmade goods
5. Real-time chat app
6. Library management system
7. Personal expense tracker (small scope)
8. Event ticketing platform
9. Smart-home IoT dashboard (less familiar domain)
10. "An app to help farmers" (deliberately vague)

**Protocol:** cache disabled; one run per idea per (model, prompt-set); plus **3 repeat runs for ideas 1, 3 and 10** to measure consistency. The script writes `eval/results/<date>_<model>_<promptset>.csv` and `.md`.

| Metric | Definition |
|---|---|
| Schema-valid first try % | LLM calls that passed Zod and the reference checks on attempt 1 ÷ all calls |
| Retry rate | repair retries ÷ calls |
| Stage failure rate | stages failed after retries ÷ stages |
| Invalid-reference rate | dropped refs (stories→R, tasks→S, edges→T) ÷ total refs proposed |
| Cycle rate | runs with ≥ 1 cycle before repair ÷ runs |
| Requirement coverage % | requirements with ≥ 1 task ÷ requirements |
| Duplicate-task rate | tasks flagged by similarity ≥ 0.8 ÷ tasks |
| Tasks per story | mean and range |
| Edges per task | mean (sanity check on dependency density) |
| Consistency (repeats) | coefficient of variation of the task count and of the CPM duration across 3 repeats |
| Run time | wall-clock time per run (s) |
| Cost per run | from recorded tokens × price table |
| Human rubric (1–5) | completeness of requirements · story quality (INVEST) · task granularity · dependency sensibility · risk usefulness. Two raters per plan (not the prompt author), averaged; record the disagreement. |

The results tables go directly into the final report. **No result is reported without a run behind it.**

### E4. End-to-end test
- Playwright with `LLM_PROVIDER=replay`: enter an idea → watch progress reach "succeeded" → plan screens render (graph nodes = task count, Gantt bars = task count, critical tasks highlighted) → download `jira.csv` and `plan.md` → assert that the CSV header and row counts are correct and the Markdown contains every T-code.
- Manual checklist at CP-D and CP-E: import the CSV into the Jira test projects and open the Markdown on GitHub.

---

## F. Deployment plan

### F1. Hosting recommendation (free / low-cost)

| Part | Choice | Why | Free-tier caveats (**verify at signup; free tiers change**) |
|---|---|---|---|
| Frontend | **Vercel** (Hobby) | Zero-config Vite deploys, preview URL per PR, global CDN; static golden plans served even if the API is down | Hobby is for non-commercial use (fine for a student project) |
| Backend | **Render** web service (free) | Runs Node and Express as-is, deploy hook, simple env management | Free instances **sleep after ~15 min idle** with a cold start of up to ~1 min (as far as I know). Warm up via `/health` before demos. A restart can interrupt a run, which is resumable from the cache. |
| Database | **Neon** Postgres (free) | Standard Postgres, branching, works with `pg` | Compute scales to zero (first query is slower); small storage cap, which is ample for us |
| Alternative | Railway / Fly.io | Fewer cold-start issues | May require a card or credit; use if the budget allows |

### F2. Environment variables
- **API:** `DATABASE_URL`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_PRICE_IN_PER_M`, `LLM_PRICE_OUT_PER_M`, `DAILY_BUDGET_USD` (e.g. 2), `MAX_CONCURRENT_RUNS` (2), `RATE_LIMIT_RUNS_PER_HOUR` (5 per IP), `DEMO_ACCESS_CODE` (optional), `CORS_ORIGIN` (the Vercel URL), `LOG_LEVEL`, `NODE_ENV`.
- **Web:** `VITE_API_BASE_URL`.
- **CI:** `DATABASE_URL` (for migrations), `RENDER_DEPLOY_HOOK_URL`.
- Secrets live only in the platform dashboards and GitHub secrets. `.env.example` documents every key without values.

### F3. Migrations and seed data
- `node-pg-migrate` with SQL files, run in the deploy workflow **before** the Render deploy hook. Migrations are forward-only; a breaking change needs a new migration.
- Seed: two or three golden runs (food delivery, hospital booking, the vague farmer idea), exported from real runs into `seed/golden/*.sql` and also copied as static JSON to `apps/web/public/golden/`.

### F4. Protecting a public demo with no auth
1. **Rate limit:** 5 new runs per IP per hour; 60 reads per minute.
2. **Concurrency:** at most 2 running pipelines; otherwise 429 `TOO_MANY_RUNS`.
3. **Daily spend cap:** before starting a run, check `spent_today + worst_case_run_cost ≤ DAILY_BUDGET_USD`. Spend is the sum of `stage_executions.cost_usd` for today. Over the cap → 429 `BUDGET_EXHAUSTED` and the UI offers golden runs.
4. **Provider-side hard limit:** set a monthly spend limit in the provider console as a backstop.
5. **Optional access code** for live runs (`DEMO_ACCESS_CODE`). Shared with evaluators; not an authentication system.
6. **Input limits:** 2,000 characters, server-side validation, JSON body limit of 50 KB.

### F5. Logging and health
- pino JSON logs with `request_id`, `run_id`, `stage`, `attempt`, tokens, latency, cost. API keys are never logged. Raw LLM outputs are stored in `stage_cache` for debugging and evaluation.
- `GET /health` reports DB reachability, whether the LLM is configured and the budget state. Render's health check uses it.
- **Startup recovery:** runs left in `running` from before a restart become `failed` with `INTERRUPTED`. The user can click "resume", which re-runs from the failed stage and is cheap because of the cache.

### F6. CI/CD
- PR → `ci.yml` (lint, typecheck, unit and contract tests, build) plus a Vercel preview.
- Merge to `main` → `deploy.yml`: CI, then migrations, then the Render deploy hook. Vercel deploys on its own.
- Tag `v*` → release notes; this is the snapshot used for the viva.

### F7. Demo readiness
- **Golden runs** come in three layers of fallback:
  1. **Live** pipeline.
  2. **Replay** mode (`LLM_PROVIDER=replay`): the full pipeline with its progress animation, running from recorded responses, with no API needed.
  3. **Static** golden `plan.json` served by Vercel, if the backend is down.
- **Pre-demo checklist:** warm-up `/health`; budget check; one live run of a short idea; backup screen recording of a full run; Jira test project open with a pre-imported CSV.

---

## G. Risks to our own project

| # | Risk | Type | Likelihood / impact | Mitigation |
|---|---|---|---|---|
| 1 | LLM output quality is poor for some domains (vague ideas) | Technical | M / H | `assumptions[]`, prompt iteration driven by evaluation, model comparison; report it honestly as a limitation |
| 2 | API budget burnt by testing or the public demo | Technical / cost | M / H | replay provider in CI and development; spend cap; rate limit; provider hard limit |
| 3 | LLM API slow or down on demo day | Technical | L–M / H | three-layer golden fallback (F7); a recorded video |
| 4 | Free-tier cold starts or sleep during the demo | Technical | H / M | warm up via `/health`; static fallback; optionally upgrade for the demo week |
| 5 | The Jira CSV does not import as assumed | Technical | M / M | Week 1 spike with a real Jira site; Markdown remains a fallback deliverable |
| 6 | Schema churn breaks parallel work | Technical / team | M / H | `contracts-v1` freeze, CODEOWNERS, versioned PlanSchema, contract tests in CI |
| 7 | Scheduler bugs undermine the "algorithms verify" claim | Technical | L / H | TDD with known-answer tests, property tests, a review by a second member |
| 8 | A 150-task graph is unreadable in React Flow | Technical | M / M | dagre layout, group by epic, filter by epic or critical path, transitive reduction |
| 9 | Late integration (the "big bang" at the end) | Timeline | M / H | walking skeleton deployed in Week 3; checkpoints A–E; fixture-first UI |
| 10 | Prompt iteration takes longer than planned | Timeline | H / M | evaluation automated by Week 7; prompt freeze in Week 10; two buffer weeks |
| 11 | Exams or festivals reduce hours | Timeline | H / M | Week 12 buffer; cut [EXTRA] items first; the MVP is the deck scope plus the fixes |
| 12 | Scope creep (editing UI, auth, live Jira sync) | Timeline | M / M | scope exclusions from the deck; all extras ranked and optional |
| 13 | Uneven workload (BE heavy) | Team | M / M | the D1 rebalancing; weekly 30-minute sync; visible task board |
| 14 | Bus factor: one person understands the prompts or the algorithms | Team | M / H | PR reviews across roles; each owner presents their part in Week 9; **everyone must be able to explain all 8 stages in the viva** |
| 15 | Merge conflicts in shared files | Team | M / L | small PRs, short-lived branches, `packages/shared` changes announced first |

---

## Appendix: decisions log and open questions

Decisions proposed in this plan and awaiting approval:

| ID | Decision | Recommendation |
|---|---|---|
| D-01 | Duration and hours | 12 weeks × 10 h/week (to confirm) |
| D-02 | Role ↔ person mapping | to be assigned |
| D-03 | LLM provider, model and budget | Evaluate 2–3 models and pick the demo model by measured quality per $ |
| D-04 | Language | TypeScript monorepo (npm workspaces) |
| D-05 | Sprint packing rule | Relaxed by default, strict kept for comparison |
| D-06 | Gantt timeline | Capacity-feasible as primary, CPM as a toggle/overlay, both labelled |
| D-07 | Cycle repair | 1 SCC-limited LLM re-proposal, then user resolution; all logged |
| D-08 | Oversize guard | Config invariant (C ≥ 13, H ≥ hours(13)) plus a typed error |
| D-09 | Risk severity | Computed by code; LLM narrates; ≥ 1 signal citation required |
| D-10 | Traceability | Story-level `requirement_ids[]` (M:N) plus coverage checks |
| D-11 | Progress transport | Polling every 2 s (SSE as an extra) |
| D-12 | Hosting | Vercel + Render + Neon; access code plus spend cap for live runs |
| D-13 | Default config | C6 table |
