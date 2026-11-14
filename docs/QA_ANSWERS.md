# The 5 examiner questions: answers

Presented by **Shreya Tiwari** (about 6 minutes, one slide per question). Every number here comes from the repository;
the master reference is [product/explanation.md](product/explanation.md). Each answer below is about one minute when
spoken.

---

## Question 1. What is the main objective of your project, and what real-world problem does it solve?

### Spoken answer (about 1 minute)

"Our objective was to build and deploy a web system that turns a one-line software idea into a complete project plan
that can be checked. The real-world problem is this: a client usually describes software in one sentence, like 'I
want an online food delivery app'. Turning that into requirements, user stories, tasks, estimates, dependencies and a
sprint schedule takes days of a senior engineer's time, and two planners give two different plans. Tools like Jira
track a plan, but they do not create one. A chatbot can write a plan-like text in seconds, but it can invent task
numbers, create circular dependencies and give timelines that do not add up. Our system gives a traceable plan: every
task links back to a requirement. And it is schedule-consistent: the timeline obeys every dependency and the team's
capacity. For our food-delivery example it produced 9 requirements, 30 tasks and a 3-sprint plan in 76 seconds, and
exports it to Jira CSV and Markdown."

### Slide bullets

- One-line idea in, full project plan out: requirements, stories, tasks, estimates, dependencies, sprints, risks
- Problem: manual planning takes days, is inconsistent, and nobody can trace a task to its requirement
- Chatbot text sounds right but cannot be trusted: invented IDs, loops, wrong arithmetic
- Our plan is traceable and schedule-consistent, and exports to Jira CSV and Markdown

### Concrete example

"I want an online food delivery app" → 9 requirements, 4 epics, 9 stories, 30 tasks, 24 dependencies, critical path
72 h, 3 sprints, 2 risks, 100% coverage, 76.2 seconds (real Gemini run, `food-delivery-gemini.json`).

### Likely follow-up questions

- **Who would use it?** A team lead, a student team or a freelancer who needs a first draft plan quickly, and then
  reviews and adjusts it. It is a starting point, not a replacement for the team's judgement.
- **How is this different from asking a chatbot for a plan?** The model only writes the content. Our code checks every
  reference, removes bad links, detects loops, computes the critical path and packs sprints, so the numbers can be
  verified with arithmetic.

---

## Question 2. Why did you choose this specific technology stack or methodology?

### Spoken answer (about 1 minute)

"Our methodology is one rule: AI generates, algorithms verify. Language models are good at turning a vague idea into
structured text, and bad at arithmetic. So Google Gemini writes the requirements, stories, tasks, estimates and risk
wording, and tested code does everything that must be correct: IDs, reference checks, cycle detection, the critical
path, sprint packing and risk severity. For the stack, we used TypeScript everywhere, so the website and the server
share the same data definitions and even the same scheduling code. That is why the what-if panel can re-plan instantly
in the browser. Zod checks every model answer against a strict schema. React and React Flow give an interactive plan
and dependency graph. Express is a small, simple server. PostgreSQL on Neon, Vercel and Render all have free tiers,
which matters for a student project. Gemini's free tier and its JSON output mode let us run real AI at no cost.
GitHub Actions, Vitest and Playwright check everything on every push."

### Slide bullets

- Methodology: AI generates, algorithms verify; the model never decides a schedule, severity or coverage number
- TypeScript end to end: shared types and shared scheduler code (instant what-if in the browser)
- Zod schemas check every model answer, with up to 2 repair retries
- Free tiers: Gemini, Neon, Vercel, Render; GitHub Actions, Vitest and Playwright for quality

### Concrete example

The same `@spm/scheduler` package runs on the server (stage 6) and in the browser: changing the team from 4 to 2
developers on the food-delivery plan instantly changes 3 sprints (30 days) to 5 sprints (50 days), with no model call.

### Likely follow-up questions

- **Why Gemini and not another model?** It has a free tier and native JSON-schema output. The code talks to the model
  through an interface, so another provider only needs one new class; a mock and a replay provider already exist.
- **Why not Python?** One language for the website, server and algorithms meant shared types and shared code; with
  Python we would have had to write the scheduler twice.

---

## Question 3. Can you explain the system architecture and data flow of your application?

_(Refers to the architecture and data-flow diagram slide.)_

### Spoken answer (about 1 minute)

"On this diagram, the user's browser loads our React website from Vercel. When you type an idea and press Generate
plan, the website sends one request to our Express API on Render. The API answers immediately with a run ID and starts
the 8-stage pipeline in the background; the browser asks for the progress every 2 seconds. Stages 1 to 5 and 7 call
Google Gemini and get JSON back. Each answer is checked with Zod and our rules, and saved in a cache in PostgreSQL on
Neon. Stage 6 is pure code from our scheduler package: cycle check, critical path and sprint packing. Stage 8
assembles one plan.json file, checks it again, and saves everything in one database transaction. The website then
loads the plan and shows the nine tabs. Exports come from the API as Jira CSV and Markdown. Three recorded real plans
are stored inside the website itself, so they open even when the API or the AI quota is not available."

### Slide bullets

- Browser → React website (Vercel) → REST API (Express on Render) → Gemini and PostgreSQL (Neon)
- Asynchronous runs: the API returns a run ID at once; the browser polls every 2 seconds
- Every stage result is validated, cached and logged; plan.json is checked before it is served
- Shared packages: contracts (Zod), scheduler (algorithms), exporters (Jira CSV, Markdown)

### Concrete example

A full run makes 8 or 9 model calls in our evaluation (stage 3 runs once per epic). The recorded food-delivery run
took 76.2 seconds and used 12,451 input and 6,226 output tokens. Changing only team settings re-runs stages 6 to 8.

### Likely follow-up questions

- **Why polling and not WebSockets?** A run takes over a minute; checking every 2 seconds is simple, works through
  every free host and proxy, and was enough.
- **What happens if the server restarts during a run?** Interrupted runs are marked failed at startup, and the run can
  be retried from the failed stage; the finished stages come from the cache.

---

## Question 4. What major technical challenges or bugs did you face, and how did you overcome them?

### Spoken answer (about 1 minute)

"We found several real problems. First, two flaws in the original design deck. Its sprint-packing rule put every
dependent task into a later sprint, so our 6-task example needed 4 sprints for 16 points; our relaxed rule needs 2.
And its packing loop never ends if one task is bigger than a sprint; we added a settings rule and a typed error, so it
always stops. Second, loops: the deck's Kahn method also reported innocent tasks, so we added Tarjan's algorithm to
find exactly the loop, plus a repair policy. Third, the free Gemini quota ran out during our work; we added sample
plans, a clear quota message, retry from the failed stage, and we switched the model. Fourth, Gemini rejected our
schema with nested array limits, so we moved those limits into descriptions and let Zod enforce them. We also fixed a
Windows bug that stored the idea as caret-garbled text, a colour-contrast failure, and our property tests found that
greedy packing has a rare anomaly."

### Slide bullets

- Design flaws fixed: strict packing over-serialised chains (4 sprints → 2); infinite-loop guard for oversized tasks
- Cycles: Kahn plus Tarjan SCC shows the exact loop; 1 model repair, then the user decides; every removal logged
- Gemini free quota used up: sample plans, quota message, retry from failed stage, model switch to 3.5-flash-lite
- Gemini 400 on nested array limits: limits sent as description hints, Zod enforces them
- Also: Windows caret bug in the stored idea, white-on-purple contrast fix, greedy-packing anomaly (about 1.4%)

### Concrete example

The stored idea text appeared as `^I^ want^ an^ online^ food^ delivery^ app^` because Windows `cmd` escaping added
carets when the idea was passed as a command-line argument. We now read the idea from a file, an `--idea` flag or an
environment variable, remove the carets, and corrected the stored row.

### Likely follow-up questions

- **How did you find the packing anomaly?** fast-check generated 1,000 random task graphs of up to 150 tasks. In about
  1.4% of them relaxed packing needed one more sprint than strict. We kept the smallest 4-task case as a test and now
  check the rule statistically.
- **What was the contrast problem?** White text on our brand purple `#8B5CF6` is only 4.2:1, which fails WCAG AA for
  16 px bold text. Buttons now use darker shades (5.7:1 and 7.1:1), and a test checks the colour pairs.

---

## Question 5. What are the key limitations of your system, and what is its future scope?

### Spoken answer (about 1 minute)

"We want to be honest about limits. Live runs depend on Gemini's free tier, which limits requests per day and is slow,
about 80 seconds a run. Our evaluation used gemini-3.5-flash-lite, because the daily quota of the model we planned was
used up, so we have results for only one model. Results also vary between runs: the same idea gave 52, 84 and 52
critical-path hours in three runs. The human quality scoring with two raters is not done yet, and the Jira import has
not been tested in a real Jira site. The schedule model is simple: one developer per task, finish-to-start links only,
and a fixed points-to-hours table. For the future: verify the Jira import and push plans through the Jira API, compare
several models, let users edit tasks and re-schedule, add a split-this-task action, learn the hours per point from a
team's history, use probability-based schedules, and add user accounts."

### Slide bullets

- Limits: free quota and slow model; only gemini-3.5-flash-lite evaluated; run-to-run variation (CPM CV 0.295)
- Not done yet: human rubric scores, real Jira import test
- Simple model: one developer per task, finish-to-start only, fixed points-to-hours, thresholds are assumptions
- Future: Jira API sync, model comparison, editing and re-scheduling, task splitting, learned estimates, Monte Carlo

### Concrete example

Three runs of the food-delivery idea: 26, 31 and 26 tasks (CV 0.104) and 52, 84 and 52 CPM hours (CV 0.295). Each plan
is internally consistent; across runs the plan changes.

### Likely follow-up questions

- **If results vary, why trust one plan?** Inside one plan every number is verified by code. Across runs the content
  changes, so a team should review the plan. The stage cache is designed to return the same answers for the same input
(shown by our tests; not yet shown on a real run).
- **Can it handle very large projects?** The design caps a plan at 150 tasks; above 80 tasks the dependency stage
  splits into per-epic calls plus one cross-epic call. Our real plans had 19 to 34 tasks; large plans were not
  evaluated with the real model.
