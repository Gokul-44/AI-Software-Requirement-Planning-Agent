# Slide outline: final presentation

25 slides, about 30 minutes. This file is the input for building the PowerPoint deck. All facts come from
[../product/explanation.md](../product/explanation.md) and [../QA_ANSWERS.md](../QA_ANSWERS.md); the word-for-word
script is [../PRESENTATION_SCRIPT.md](../PRESENTATION_SCRIPT.md) and the demo steps are
[../DEMO_WALKTHROUGH.md](../DEMO_WALKTHROUGH.md).

| Part                         | Speaker                | Slides | Minutes |
| ---------------------------- | ---------------------- | ------ | ------- |
| Opening and first half       | Saransh Sarang Naik    | 1-8    | 7       |
| Second half                  | Akshay Kumar Tapraniya | 9-15   | 7       |
| The 5 examiner questions     | Shreya Tiwari          | 16-20  | 6       |
| Live demo, closing, Q&A      | Gokul Faleja           | 21-25  | 10      |

Design notes for the deck builder: use the website's colours (forest green `#1F3D2B`, sand beige `#E8DCC4`, purple
`#8B5CF6` only as an accent, for example the critical path). Use real screenshots from `docs/assets/screenshots/`.
Mark AI steps and code steps with two different colours in the pipeline diagram (purple for AI, green for code, as in
the README). The live website address is `https://ai-software-requirement-planning-ag-two.vercel.app` (to be filled in by the lead).

---

## Slide 1. Title

- **Speaker:** Saransh Sarang Naik
- **Title:** AI Software Requirement & Planning Agent
- **Bullets:**
  - Turn a one-line software idea into a traceable, schedule-consistent project plan
  - Final-year project, IIIT Vadodara, International Campus Diu
  - Gokul Faleja · Saransh Sarang Naik · Akshay Kumar Tapraniya · Shreya Tiwari
- **Visual:** `docs/assets/social-preview.png` or `docs/assets/screenshots/readme-landing.png`
- **Speaker notes:** Good morning. We are presenting the AI Software Requirement and Planning Agent, our final-year
  project. I am Saransh, and with me are Akshay, Shreya and Gokul. All four of us worked on every part of the project.

## Slide 2. The problem

- **Speaker:** Saransh
- **Bullets:**
  - Clients describe software in one sentence: "I want an online food delivery app"
  - Turning it into requirements, stories, tasks, estimates and a schedule takes days of senior time
  - Two planners give two different plans; tasks cannot be traced back to requirements
  - Jira tracks a plan once it exists; it does not create one
- **Visual:** a simple icon row: one sentence → question marks → a big plan document
- **Speaker notes:** Planning is slow, inconsistent and hard to trace. A chatbot can write a plan-like text quickly,
  but it can invent task numbers, create circular dependencies and give timelines that do not add up.

## Slide 3. Objective

- **Speaker:** Saransh
- **Bullets:**
  - Build and deploy a web system: one-line idea in, verified plan out
  - Output: requirements, epics, user stories with acceptance criteria, tasks, estimates
  - Plus: validated dependency graph, critical path, capacity-feasible sprint plan, grounded risks
  - Export to Jira CSV and Markdown
- **Visual:** a checklist of the plan parts
- **Speaker notes:** Two words matter: traceable, so every task links to a story and a requirement, and
  schedule-consistent, so the timeline obeys every dependency and the team's capacity.

## Slide 4. Our solution

- **Speaker:** Saransh
- **Bullets:**
  - Type an idea, optionally set team size and sprint length, press Generate plan
  - About a minute and a half later: a full plan in nine tabs
  - Change the team size and the schedule is recomputed instantly in the browser
  - Three real recorded plans open instantly, even without the AI
- **Visual:** `docs/assets/screenshots/landing-1440.png`
- **Speaker notes:** The food-delivery run took 76 seconds and produced 9 requirements, 30 tasks and a 3-sprint plan.
  Our evaluation measured 79.8 seconds per run on average.

## Slide 5. AI generates, algorithms verify

- **Speaker:** Saransh
- **Bullets:**
  - The AI (Google Gemini) writes: requirements, stories, tasks, estimates, dependency proposals, risk wording
  - Our code decides: IDs, reference checks, cycle detection, critical path, sprints, risk severity, coverage
  - Every model answer is checked against a strict schema, with up to 2 repair retries
  - The model never decides a schedule, a severity or a coverage number
- **Visual:** two columns, "AI generates" (purple) and "Algorithms verify" (green)
- **Speaker notes:** Language models are good at writing and bad at arithmetic. So we let each side do what it is good
  at. That is why the plan can be checked with arithmetic, not just read and believed.

## Slide 6. The 8-stage pipeline

- **Speaker:** Saransh
- **Bullets:**
  - 1 Requirements · 2 Epics and stories · 3 Tasks · 4 Estimates · 5 Dependencies (AI, then code checks)
  - 6 Scheduling: cycle check, CPM, priority order, sprint packing (code only)
  - 7 Risks: code computes signals, AI explains them, code checks citations
  - 8 Assemble and export: plan.json validated, Jira CSV and Markdown (code only)
- **Visual:** the README pipeline diagram (8 boxes, purple for AI stages, green for code stages)
- **Speaker notes:** Every stage result is cached under a key made of the stage, prompt version, model, settings and
  input. When only the team settings change, only stages 6 to 8 run again.

## Slide 7. One idea through the pipeline

- **Speaker:** Saransh
- **Bullets:**
  - Stage 1: 9 requirements (6 functional, 3 non-functional) and 4 assumptions
  - Stages 2-3: 4 epics, 9 stories, 30 tasks (one model call per epic)
  - Stages 4-5: 92 story points = 368 hours; 24 dependencies, 0 removed, 0 cycles
  - Stages 6-8: critical path 72 h (12 days), 3 sprints (30 days), 2 risks, 100% coverage
- **Visual:** a funnel or table from `food-delivery-gemini.json` (real Gemini run, gemini-3.5-flash-lite, 76.2 s)
- **Speaker notes:** This is a real run of "I want an online food delivery app". Example requirement: "All user
  passwords must be securely hashed using bcrypt before storage." Example assumption: "Payment processing will be
  handled by a third-party gateway like Stripe."

## Slide 8. Traceability and coverage

- **Speaker:** Saransh
- **Bullets:**
  - Every story lists the requirements it satisfies; every task belongs to a story
  - Code checks coverage: every requirement has a story (C1), every story has a task (C2)
  - Gaps get one targeted retry, then a warning and a risk signal: never hidden
  - Food example: 9 of 9 requirements reach a task
- **Visual:** a chain R-004 → S-005 → T-015, T-016, T-017, T-018 (payments), or `plan-overview-1440.png` (coverage meter)
- **Speaker notes:** This fixes a gap in the original design deck, where the database had no link from epics to
  requirements. Now I hand over to Akshay, who will explain how the system is built and how the algorithms work.

## Slide 9. Architecture and data flow

- **Speaker:** Akshay Kumar Tapraniya
- **Bullets:**
  - Browser → React website (Vercel) → Express API (Render)
  - API → Google Gemini (structured JSON) and PostgreSQL (Neon)
  - Runs are asynchronous: run ID returned at once, progress polled every 2 seconds
  - Shared packages: contracts (Zod), scheduler, exporters; sample plans stored in the website
- **Visual:** the README architecture diagram (Browser, Web app, API, Gemini, PostgreSQL, recorded plans, shared
  packages). Shreya's Question 3 refers back to this slide.
- **Speaker notes:** One request starts the run. The pipeline runs in the background and saves every stage. The final
  plan.json is validated and saved in one transaction. The sample plans live in the website itself, so they open even
  when the API is asleep.

## Slide 10. Dependency graph and cycles

- **Speaker:** Akshay
- **Bullets:**
  - Edges are finish-to-start: "A must finish before B starts"
  - Code removes unknown references, self-links and duplicates, and logs each one as an issue
  - Kahn's algorithm: quick test for loops; Tarjan's SCC: finds exactly which tasks form the loop
  - Repair: 1 model re-proposal for the loop only, then the user picks the edge to remove; all logged
- **Visual:** `docs/assets/screenshots/run-cycle-1440.png` (simulated loop T-003 → T-004 → T-005 → T-003)
- **Speaker notes:** The original deck reported every task Kahn could not process. With A → B → C → A and C → D, that
  includes D, which is only a victim. Tarjan reports exactly {A, B, C} and D as blocked. In our 12 completed real runs
  there were 0 cycles.

## Slide 11. Critical path (CPM)

- **Speaker:** Akshay
- **Bullets:**
  - 6-task example: A 8 h, B 12 h, C 8 h, D 20 h, E 4 h, F 12 h
  - Edges: A→B, A→C, B→D, C→D, C→E, D→F, E→F
  - Minimum length 52 h; critical path A → B → D → F; slack: C 4 h, E 20 h
  - Integer hours, so "critical" means slack exactly 0
- **Visual:** the 6-task graph with A, B, D, F in purple, and the small ES/EF table; or `plan-graph-1440.png`
- **Speaker notes:** Forward pass: each task starts when its predecessors finish. Backward pass: how late can it start
  without delaying the end. The difference is slack. Real food plan: T-015 → T-016 → T-017 → T-018, 72 hours.

## Slide 12. Sprint packing: strict versus relaxed

- **Speaker:** Akshay
- **Bullets:**
  - Priority order: smallest slack, then most downstream work, then ID: A, B, C, D, E, F
  - Strict (deck rule), C = 10 points: {A} {B, C} {D, E} {F} = 4 sprints
  - Relaxed (our fix), C = 10, H = 40 h: {A, B, C, E} {D, F} = 2 sprints
  - Guard: C ≥ 13 and H ≥ hours of 13 points, plus a typed error, so packing always ends
- **Visual:** the two tables side by side:

  | Sprint | Strict | Points | Relaxed    | Points |
  | ------ | ------ | ------ | ---------- | ------ |
  | 1      | A      | 2      | A, B, C, E | 8      |
  | 2      | B, C   | 5      | D, F       | 8      |
  | 3      | D, E   | 6      |            |        |
  | 4      | F      | 3      |            |        |

- **Speaker notes:** Strict packing over-serialises chains: 16 points need 4 sprints. Relaxed packing lets a task share
  a sprint with its predecessor if the chain fits in the sprint's hours. On the real food plan, strict gives 4 sprints
  and relaxed gives 3. Property tests found that greedy relaxed packing is worse in about 1.4% of random graphs; we
  documented it.

## Slide 13. Grounded risks

- **Speaker:** Akshay
- **Bullets:**
  - Code computes signals from the plan: value, threshold, severity (14 kinds)
  - The model only explains signals and suggests mitigations; it must cite a signal ID
  - Code rejects uncited risks and sets severity = highest cited signal
  - Food example: RK-001 high, cites SG-02 (T-015 has 6 downstream tasks, 0 h slack; threshold 5)
- **Visual:** `docs/assets/screenshots/readme-risks.png`
- **Speaker notes:** A risk written freely by a model is an opinion. Ours is evidence: every risk shows the measured
  value behind it. RK-002 (medium) cites 2 of 3 sprints packed to at least 98% and the 2.50× capacity ratio.

## Slide 14. Tech stack

- **Speaker:** Akshay
- **Bullets:**
  - TypeScript everywhere; React + Vite + Tailwind; React Flow for the graph; custom SVG Gantt
  - Node.js + Express API; Zod schemas for model output, API and plan.json
  - Google Gemini (free tier) behind an interface, plus mock and replay providers
  - PostgreSQL on Neon; Vercel and Render; GitHub Actions; Vitest, fast-check, Playwright
- **Visual:** logo grid, grouped by Web, API, AI, Data, Delivery, Testing
- **Speaker notes:** Shared TypeScript lets the browser run the same scheduler as the server, which powers the what-if
  panel. CI never calls the real model; it uses the replay provider. 349 automated tests.

## Slide 15. Evaluation results (measured)

- **Speaker:** Akshay
- **Bullets:**
  - 10 fixed ideas, 13 real runs, cache off, model gemini-3.5-flash-lite
  - 98.1% of model answers valid first try (105 of 107); 0 of 98 stages failed
  - 0 invalid references of 688; 0 cycles; 100% coverage; 0% duplicate tasks
  - 79.8 s per run on average; repeats of one idea: task count CV 0.104, CPM CV 0.295
- **Visual:** a results table from `eval/results/2026-11-15_gemini-3.5-flash-lite.md`
- **Speaker notes:** Honest notes: the planned model gemini-3.6-flash had used up its free daily quota, so all runs used
  gemini-3.5-flash-lite. One run hit a provider 503 error and was repeated. The human rubric scores and the Jira import
  test are still pending. Now Shreya will answer the five questions examiners most often ask.

## Slide 16. Q1: Objective and real-world problem

- **Speaker:** Shreya Tiwari
- **Bullets:**
  - One-line idea in, full project plan out
  - Manual planning takes days, is inconsistent and untraceable
  - Chatbot text cannot be trusted: invented IDs, loops, wrong arithmetic
  - Our plan is traceable, schedule-consistent and exports to Jira CSV and Markdown
- **Visual:** the food-delivery numbers (9 requirements, 30 tasks, 3 sprints, 76 s)
- **Speaker notes:** Spoken answer: see [QA_ANSWERS.md, Question 1](../QA_ANSWERS.md#question-1-what-is-the-main-objective-of-your-project-and-what-real-world-problem-does-it-solve).

## Slide 17. Q2: Why this stack and methodology

- **Speaker:** Shreya
- **Bullets:**
  - AI generates, algorithms verify
  - TypeScript end to end: shared types and shared scheduler (instant what-if)
  - Zod checks every model answer, with repair retries
  - Free tiers: Gemini, Neon, Vercel, Render
- **Visual:** small tech-stack strip
- **Speaker notes:** Spoken answer: see [QA_ANSWERS.md, Question 2](../QA_ANSWERS.md#question-2-why-did-you-choose-this-specific-technology-stack-or-methodology).

## Slide 18. Q3: Architecture and data flow

- **Speaker:** Shreya
- **Bullets:**
  - Browser → React (Vercel) → Express API (Render) → Gemini and PostgreSQL (Neon)
  - Asynchronous run, polled every 2 seconds
  - Every stage validated, cached and logged; plan.json checked before serving
  - Sample plans stored in the website as a fallback
- **Visual:** repeat the architecture diagram from slide 9
- **Speaker notes:** Spoken answer: see [QA_ANSWERS.md, Question 3](../QA_ANSWERS.md#question-3-can-you-explain-the-system-architecture-and-data-flow-of-your-application).

## Slide 19. Q4: Challenges and how we solved them

- **Speaker:** Shreya
- **Bullets:**
  - Deck flaws: strict packing (4 sprints → 2) and the oversized-task infinite loop
  - Cycles: Kahn + Tarjan SCC, one model repair, then the user decides
  - Gemini quota used up: sample plans, quota message, retry from failed stage, model switch
  - Gemini rejected nested array limits: description hints + Zod
  - Windows caret bug, colour-contrast fix, greedy-packing anomaly (about 1.4%)
- **Visual:** `docs/assets/screenshots/error-rate-limited-1440.png` (friendly limit message) next to the bullet list
- **Speaker notes:** Spoken answer: see [QA_ANSWERS.md, Question 4](../QA_ANSWERS.md#question-4-what-major-technical-challenges-or-bugs-did-you-face-and-how-did-you-overcome-them).

## Slide 20. Q5: Limitations and future scope

- **Speaker:** Shreya
- **Bullets:**
  - Free quota and slow model; only gemini-3.5-flash-lite evaluated
  - Run-to-run variation (CPM CV 0.295); human rubric and Jira import still pending
  - Simple model: one developer per task, finish-to-start only, fixed points-to-hours
  - Future: Jira API sync, model comparison, editing, task splitting, learned estimates
- **Visual:** two columns, "Limits today" and "Next steps"
- **Speaker notes:** Spoken answer: see [QA_ANSWERS.md, Question 5](../QA_ANSWERS.md#question-5-what-are-the-key-limitations-of-your-system-and-what-is-its-future-scope).
  Then hand over to Gokul for the live demo.

## Slide 21. Live demo

- **Speaker:** Gokul Faleja
- **Bullets:**
  - Live website: `https://ai-software-requirement-planning-ag-two.vercel.app`
  - API health: https://spm-planning-agent-api.onrender.com/api/health
  - Idea we will type: "I want an online food delivery app"
- **Visual:** a large QR-code placeholder box (QR code for `https://ai-software-requirement-planning-ag-two.vercel.app`, to be generated by the lead) and the URL in
  large text
- **Speaker notes:** Gokul switches to the browser and follows [DEMO_WALKTHROUGH.md](../DEMO_WALKTHROUGH.md) part B.

## Slide 22. Backup: the demo in screenshots

- **Speaker:** Gokul (only if the internet or the live site fails)
- **Bullets:**
  - Landing page and idea box
  - 8-stage run progress
  - Overview, graph with critical path, timeline with what-if
  - Risks with cited signals
- **Visual:** a 2×3 grid: `landing-1440.png`, `run-progress-midrun-1440.png`, `plan-overview-1440.png`,
  `plan-graph-1440.png`, `plan-timeline-1440.png`, `readme-risks.png` (all in `docs/assets/screenshots/`)
- **Speaker notes:** If the live site is not reachable, Gokul says: "The internet is not cooperating, so here are
  screenshots of the same screens, and then a recorded video of a full run." Then he plays the backup video.

## Slide 23. Conclusion

- **Speaker:** Gokul
- **Bullets:**
  - A one-line idea becomes a traceable, schedule-consistent plan in about 80 seconds
  - AI generates; tested algorithms verify every reference, loop, schedule and severity
  - Measured: 98.1% valid first try, 0 invalid references, 100% coverage on 12 completed runs
  - Deployed on free tiers, with sample-plan fallback and quota protection
- **Visual:** `docs/assets/screenshots/readme-overview.png`
- **Speaker notes:** The main idea of the project is that AI output becomes useful when code checks it.

## Slide 24. Future scope

- **Speaker:** Gokul
- **Bullets:**
  - Verify the Jira import, then sync through the Jira API
  - Human rubric scores and comparison of several models
  - Edit tasks and links in the UI, split oversized tasks, re-schedule
  - Learned points-to-hours, probability-based schedules, user accounts
- **Visual:** a simple roadmap arrow
- **Speaker notes:** These come from the "extras" list in our design document and the pending items in our development
  log.

## Slide 25. Thank you / Questions

- **Speaker:** Gokul (all four answer questions)
- **Bullets:**
  - Thank you
  - Questions?
  - Gokul Faleja · Saransh Sarang Naik · Akshay Kumar Tapraniya · Shreya Tiwari
- **Visual:** `docs/assets/social-preview.png`, live URL `https://ai-software-requirement-planning-ag-two.vercel.app` and the GitHub repository name
  `Gokul-44/AI-Software-Requirement-Planning-Agent`
- **Speaker notes:** All four of us can answer about any part. See the "who answers which question" table at the end
  of [PRESENTATION_SCRIPT.md](../PRESENTATION_SCRIPT.md).
