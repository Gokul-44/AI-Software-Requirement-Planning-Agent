# Live demo walkthrough (Gokul Faleja)

The complete, click-by-click plan for the live demo (about 8 minutes 30 seconds of demo inside Gokul's 10 minutes; the
last 1 minute 30 seconds is the closing on slides 23 to 25, see [PRESENTATION_SCRIPT.md](PRESENTATION_SCRIPT.md)).

- Live website: `https://ai-software-requirement-planning-ag-two.vercel.app`
- Live API health check: https://spm-planning-agent-api.onrender.com/api/health
- The idea to type: **I want an online food delivery app**

Every button, tab and label written in **bold** below was checked on the real website (local mock stack, the same
website code). Words in "quotes" are what you say. The numbers of a fresh live run come from the AI and **will be
different every time**: always read them from the screen. The reference numbers in brackets come from the recorded
sample plan "I want an online food delivery app" (real Gemini run), which you use as the backup.

---

## A. Before the demo (start 10 minutes before)

Tick each line.

- [ ] **Laptop:** charger plugged in. Windows Do Not Disturb on (Settings, System, Notifications, Do not disturb).
      Close chat apps, email and all other browser tabs.
- [ ] **Browser:** use a clean profile (no bookmarks bar, no extensions popping up). Zoom to **110% to 125%**
      (Ctrl and +) so the back row can read the screen.
- [ ] **Wake the API (Render free tier sleeps after about 15 minutes; the first request then takes about 50 seconds):**
      open https://spm-planning-agent-api.onrender.com/api/health and refresh until it answers quickly with
      `"status":"ok"` and `"db":"ok"`. If it says `"degraded"`, the database is not reachable: plan to use the sample
      plans.
- [ ] **Open the live site** `https://ai-software-requirement-planning-ag-two.vercel.app` in tab 1. Check that the header shows the green badge **Live API**.
- [ ] **AI quota check:** the live site allows only **3 new runs per hour from one address** and **15 live runs per
      day** in total, and a re-plan also counts. The demo needs 2 runs (the main run and one re-plan). So:
  - do the one test run of a short idea **more than one hour before** the presentation, not in the last hour;
  - if that test run shows "The free AI quota is used up right now", tell the lead at once (the lead can switch
    `GEMINI_MODEL` on Render to another model with its own free quota), and plan to use the sample plan.
- [ ] **Backup tab 2:** on the home page scroll to **Try a sample plan** and open **I want an online food delivery app**
      (button **Open plan**). Leave it open in tab 2.
- [ ] **Backup tab 3:** open the screenshot `docs/assets/screenshots/error-rate-limited-1440.png` (from the repository
      on GitHub or from the laptop) for step 14.
- [ ] **Backup video** (part D) is on the laptop desktop and plays offline. Test the audio once.
- [ ] **Excel** (or LibreOffice Calc) is installed and opens `.csv` files. Clear the Downloads folder so the new files
      are easy to find.
- [ ] **Slides** are open on slide 21 (Live demo) in presenter view, ready to switch with Alt+Tab.
- [ ] **Phone hotspot** ready in case the venue Wi-Fi fails.

---

## B. The live walkthrough (about 8 minutes 30 seconds)

Times are from the start of the demo (the moment you switch from slide 21 to the browser).

| Time | What to click or type (exact) | What to point at on screen | What to say (exact words) | Why it matters (feature proved) |
| --- | --- | --- | --- | --- |
| 0:00 | **Step 1. Landing page.** Alt+Tab to the browser, tab 1 (`https://ai-software-requirement-planning-ag-two.vercel.app`). Scroll to the top. | The header (**Planning Agent**, **Home**, **History**, **New plan**, badge **Live API**) and the hero heading **From a one-line idea to a plan you can verify** with the small label **AI generates, algorithms verify**. | "This is our website. The problem in one line: turning a one-sentence software idea into a real project plan takes days, and a chatbot's plan cannot be trusted. Our rule is written right here: AI generates, algorithms verify. The green badge says we are connected to the live server." | The deployed product exists; the core design rule is visible. |
| 0:30 | **Step 2. Type the idea.** Click the box under **Describe your software idea in one line** and type exactly: `I want an online food delivery app` | The counter **34 / 2000** and the hint **Between 10 and 2000 characters.** Then the chips under **Try an example:** (**Food delivery**, **Hospital booking**, **Library system**, **Fitness tracker**). Do not click a chip (it would replace the text). | "I type a simple idea, exactly as a client would say it. The counter checks the length. If you have no idea, these example chips fill in a longer one." | Input validation; the system accepts plain, short ideas. |
| 0:55 | Click **Team and sprint settings** (the bar showing **4 devs · 10-day sprints · 6 focus h/day · relaxed packing**). Point at the fields, then click in **Team size**, change 4 to 1, show the red message, then click **Reset to defaults**. | Fields **Team size**, **Velocity per person**, **Sprint length**, **Focus hours per day**, **Points to hours**, **Sprint packing** (**Relaxed** / **Strict**). The **Capacity rules** checks: **Capacity C = 40 points per sprint must be at least 13** and **Sprint hours H = 60 must fit the largest task (52 h)**. With team size 1 the message **Team size x velocity must be at least 13 points (now 10).** appears. | "These are the team settings: 4 developers, 10 points each per sprint, 10-day sprints, 6 focus hours a day. Watch these two checks. If I set the team to one person, a sprint holds only 10 points, but the biggest task is 13 points, so the form warns me at once. This rule is what stops the sprint packing from looping forever. I reset to the defaults." | Live config validation; the oversized-task guard (design flaw we fixed). |
| 1:30 | **Step 3. Run progress.** Click **Generate plan**. The page changes to **Building your plan**. | The progress bar, **Elapsed time**, the sentence **This page refreshes every 2 seconds while the run is active.**, and the 8 stages: **Requirement analysis** (AI), **Epics and stories** (AI), **Task decomposition** (AI), **Effort estimation** (AI), **Dependencies** (AI + code), **Scheduling** (Code), **Risks** (AI + code), **Assemble and export** (Code). Each stage shows **Waiting**, **Running** or **Done**, with attempts and time. | "The server started a run and the page checks it every 2 seconds. These badges show who does each stage: purple AI badges are the model, Code is our algorithms." (Then keep talking while it runs, see the next row.) | Asynchronous pipeline, 8 stages, AI versus code made visible. |
| 1:50 | Wait. Do not click. Point at each stage as it turns to **Done**. A run took 79.8 s on average in our evaluation (longest 106.9 s), plus the time between calls. | Stage 1 **Done** with **1 attempt**; stage 3 shows **model calls** (one per epic). The skeleton box **Your plan will appear here**. | Say while waiting: "Stage 1 writes the requirements and lists its assumptions. Our code gives every item its ID, the model never does. Stage 2 makes epics and user stories, and code checks that every requirement has a story. Stage 3 runs once per epic, which is why it shows several model calls. Stage 4 gives story points; code turns them into hours, 4 hours per point. In stage 5 the model proposes dependencies, and code removes bad links and checks for loops. Every answer is checked against a strict schema; if it is wrong, we send the errors back and ask again. Our evaluation measured 98.1 percent of answers valid on the first try. Stages 6 and 8 are pure code: they take milliseconds." | The AI is real and live; validation and repair retries; cost control (6.5 s gap between calls). |
| 3:00 | **Step 4. Overview.** When all 8 stages are **Done**, the plan opens on the **Overview** tab by itself. If it does not, wait for **Your plan is ready**. | The title (the idea), the green **succeeded** badge, the line **gemini · (model name)**. The KPI tiles **REQUIREMENTS**, **STORIES**, **TASKS** (with "N on the critical path"), **STORY POINTS**, **DURATION** (with "CPM minimum ..."), **SPRINTS**, **HIGH RISKS**, **COVERAGE** (the green meter). Then **Assumptions** and **Two timelines, two questions**. | "Here is the plan, written live by Gemini and checked by our code. It has [read the numbers] requirements, stories and tasks. Coverage is 100 percent: every requirement reaches a task. Here are the assumptions the AI made to fill gaps in my one line, so the client can correct them. And here are two timelines: the minimum with unlimited people, and the real plan for 4 developers." (Sample plan: 9 requirements, 9 stories, 30 tasks, 92 points, 30 days, CPM 12 days, 3 sprints, 1 high risk, 100%.) | Complete plan from one line; coverage is computed by code; assumptions make ambiguity visible. |
| 3:30 | **Step 5. Requirements and Stories.** Click the tab **Requirements**. Then click the tab **Stories**. | Requirements: **Requirements with a story** and **Requirements with a task** (both 100%), each row like **R-001 must functional Covered · 1 story · 4 tasks**, the filter **Coverage gaps**. Stories: one story card with "As a ..., I want ..., so that ...", **ACCEPTANCE CRITERIA**, **Requirements** (an R-code) and **Tasks** (T-codes). | "Every requirement shows how many stories and tasks cover it. In the stories, each one is written as 'As a user, I want, so that', with testable acceptance criteria, the requirements it satisfies, and its tasks. So you can trace any task back to the requirement it came from." | Traceability requirement to story to task; acceptance criteria. |
| 4:00 | **Step 6. Tasks.** Click the tab **Tasks**. Click one row on the critical path (one marked **critical**). | Columns **ID**, **TASK**, **LAYER**, **PTS**, **HOURS**, **SPRINT**, **SLACK (H)**, **CRITICAL**. In the panel **Task details**: **ESTIMATE** (story points and hours), **SCHEDULE (CPM, UNLIMITED PEOPLE)**, **Slack**, **DEPENDS ON**, **BLOCKS**, **TRACES TO**, **RISK SIGNALS**. Close it with **Close**. | "Each task has a layer and story points from the AI. Our code converts points to hours with the team's table, 4 hours per point, so 5 points is 20 hours. Clicking a task shows its schedule, what it waits for, what it blocks, and which requirement it traces to." (Sample: T-017 "Integrate third-party payment gateway", 8 points = 32 hours.) | Story points to hours by code; per-task traceability and schedule. |
| 4:30 | **Step 7. Graph.** Click the tab **Graph**. Click **Fit view**. Then tick **Critical path only** and untick it again. | The purple nodes and arrows (legend **Critical path**), the epic colours in the legend. | "This is the dependency graph: an arrow means 'must finish before'. The purple chain is the critical path, found by code. Slack in one sentence: slack is how many hours a task can slip without delaying the whole project, and critical tasks have zero slack." (Sample: T-015 → T-016 → T-017 → T-018, the payments chain, 72 hours.) | Validated dependency graph; critical path computed by CPM. |
| 5:00 | **Step 8. Timeline.** Click the tab **Timeline**. It shows **Sprint plan (capacity)**. Then click **CPM (unlimited people)**, then back to **Sprint plan (capacity)**. | The Gantt bars, purple for critical tasks, the dashed line, the text **Sprint plan: what a team of 4 developers can actually deliver**, then **CPM: the dependency-limited lower bound, with unlimited people**. | "The sprint plan is what 4 developers can really deliver. The CPM view shows the minimum if everyone could work in parallel. They differ on purpose: CPM ignores team size, the sprint plan respects it. The ratio on the Overview tells us whether adding people would help." (Sample: 30 working days versus 12, ratio 2.50×.) | Two schedules with clear roles; capacity-feasible planning. |
| 5:40 | **Step 9. Sprints and what-if.** Click the tab **Sprints**. In the **What-if** panel, drag the **Team size** slider from **4** to **2**. Then click **Reset to plan**. | Sprint cards like **Sprint 1 ... / 40 pts**. In **What-if**: the label **scenario active**, **2 devs (plan: 4)**, the **BEFORE / AFTER** table (**Sprints**, **Working days**, **Points / sprint**) and the sentence **CPM stays at ... days whatever the team**. | "Each sprint is filled up to the team's capacity, 40 points. Now, what if we had only 2 developers? I move the slider. The plan is recomputed instantly in the browser with the same code as the server, no AI call. The number of sprints goes up, and the critical path does not change, because it does not depend on team size. Reset." (Sample: 3 sprints / 30 days becomes 5 sprints / 50 days.) | Shared scheduler in the browser; instant what-if; relaxed packing under capacity. |
| 6:15 | **Step 10. Risks.** Click the tab **Risks**. | The intro sentence **Severity comes from computed signals, never from the language model.** A risk card: severity badge, **AI narrative**, **MITIGATION**, **EVIDENCE (CITED SIGNALS)** with **value ... · threshold ...**, **LINKED TASKS**. | "The AI wrote these risks, but it was only allowed to explain signals that our code measured. Every risk cites at least one signal with its value and threshold, and the severity is computed by code: the highest severity of the cited signals. So every claim can be checked." (Sample: RK-001 high, cites SG-02: value 6, threshold 5.) | Grounded risks; severity by code, not by the model. |
| 6:45 | **Step 11. Issues.** Click the tab **Issues**. | If empty: **No issues found** and **Every reference resolved, the graph is acyclic and every requirement is covered.** If not empty: each issue (removed link, loop repair, coverage gap) with its IDs. | If empty: "This tab lists everything the code caught: links to tasks that do not exist, duplicate links, loops, coverage gaps. Here the code checked every reference and found none, the graph has no loops and every requirement is covered. If the AI makes a loop, the run stops and asks the user which link to remove, and it is logged here." If not empty: "Here the code caught [read the issue], and it is logged, not hidden. That is 'algorithms verify'." | Algorithms verify: nothing is silently dropped. |
| 7:05 | **Step 12. Exports.** Click **Jira CSV** (top right of the plan). Open the downloaded file (name ends in `jira.csv`) in Excel. Then back in the browser click **Markdown** and open `plan.md`. | The toast **Jira CSV exported**. In Excel: columns **Issue Id**, **Parent Id**, **Issue Type** (Epic, Story, Sub-task), **Summary**, **Description**, **Priority**, **Story Points**, **Labels**, **Blocked By**. Then the Markdown file. | "The plan exports to a Jira-ready CSV: epics, stories and tasks as sub-tasks, linked by parent, with story points, requirement and sprint labels, and blocked-by links. To be honest, we have not yet tested the import into a real Jira site. It also exports a readable Markdown document." | Exports for real tools (Jira CSV, Markdown). |
| 7:40 | **Step 13. History and re-plan.** Close Excel. In the browser click **History** (top). Click the newest row (our idea). On the plan click **Timeline**, set **Team size** to **2** in **What-if**, and click **Re-plan with new team settings**. | History: **Your most recent projects, newest first.** with the idea and its status. After the re-plan: a new run page where stages 1 to 5 show **Reused**, then the new plan opens with the new sprint count on **Overview**. | "History keeps every run. Now I save the 2-developer scenario as a new run. Watch: stages 1 to 5 say Reused, because the requirements, stories, tasks, estimates and dependencies are taken from the saved run without asking the AI again. Only scheduling, risks and assembly run again." | Re-runs reuse saved stages (cache); run history. |
| 8:05 | **Step 14. Phone view and quota message.** Press F12, then Ctrl+Shift+M (device toolbar), pick a phone size, scroll the plan. Press F12 again to close. Then Alt+Tab to tab 3 (the error screenshot). | On the phone: no sideways scrolling, tabs scroll, the **Export** menu. In the screenshot: the friendly message and the purple button to open a demo plan. | "The site works on a phone. And if the free AI quota runs out, the user does not see a crash: the run page says 'The free AI quota is used up right now', keeps the finished stages, and offers Retry from stage N and Open a sample plan. The sample plans are real Gemini plans stored inside the website." | Responsive design; graceful failure and fallback. |
| 8:25 | **Step 15. Closing line.** Alt+Tab back to the slides and go to slide 23. | Slide 23 (Conclusion). | "So, from one sentence to a verified plan, live, in under two minutes. AI generates, algorithms verify." | Wraps the demo; hands over to the closing slides. |

---

## C. Backup paths

Stay calm, say one sentence, and switch. Never try more than one extra live run (it costs quota and time).

| Problem | When you notice it | What to do | What to say |
| --- | --- | --- | --- |
| Render is asleep | Before the demo, health takes long; or **Generate plan** waits with no stage moving | Before: refresh the health URL until fast (about 50 s). During: wait up to 60 s while explaining the stages. If still nothing, switch to tab 2 (sample plan). | "Our free server was asleep and is waking up. Meanwhile, here is a plan the system made earlier with the same AI." |
| Gemini is slow | A stage shows **Running** for a long time | Keep talking (step 3 text). Most runs finished in 57 to 107 s in our evaluation. If it passes 3 minutes, switch to tab 2 and come back to the run at step 13 (open it from **History**). | "The free AI tier is slow today. The run continues on the server, so let me show the same steps on a finished plan." |
| Quota used up during the run | The page shows **The run stopped** and **The free AI quota is used up right now** | Point at it: this is a feature. Click **Open a sample plan** and continue from step 4 with the sample plan. Do not click **Retry from stage N** during the demo. | "This is exactly the free-quota limit we told you about. The finished stages are saved, and the user can retry later or open a sample plan, which I will do now." |
| Rate limit or daily cap on start | A red box on the home page, for example **You have started a lot of runs** or **The daily live-run limit is reached** | Click **Open a golden demo plan** and continue from step 4. | "Our site limits runs per visitor to protect the free quota. Here is a real recorded plan instead." |
| Re-plan blocked (step 13) | A limit message after **Re-plan with new team settings** | Skip the re-plan; show the what-if preview only (step 9). | "The re-plan would count as another live run, so I will show the instant preview instead." |
| Live site does not load at all | `https://ai-software-requirement-planning-ag-two.vercel.app` gives an error | Try the phone hotspot once. If still down, Alt+Tab to slides, show slide 22 (backup screenshots), then play the backup video (part D). | "The internet is not cooperating, so here are screenshots of the same screens, and then a recording of a full live run." |
| Internet fails completely | Nothing loads | Slide 22, then the backup video from the laptop (offline). | Same as above. |
| Excel does not open | Step 12 | Open the CSV in Notepad instead; the columns are still readable. | "Here is the same file as plain text: one row per epic, story and task." |

---

## D. The demo video (recorded in advance as a backup)

### Tools

- **Recording:** Windows Xbox Game Bar (press **Win+Alt+R** to start and stop recording the active app window; it
  records one app, which is fine for the browser) or **OBS Studio** (free; use a "Window Capture" of the browser and a
  microphone source).
- **Trimming:** **Clipchamp** (included in Windows 11): cut the waiting time in stage 3, add short text captions.

### Settings

- 1080p (1920 × 1080), 30 frames per second.
- Browser in full screen (F11), zoom 110%, a clean profile with no bookmarks bar and no extensions.
- Notifications off (Do Not Disturb). A quiet room, a headset microphone if possible.
- Record from the live site `https://ai-software-requirement-planning-ag-two.vercel.app` with the real AI. Do it more than one hour before any other planned run,
  because the video needs two live runs and a re-plan (the limit is 3 runs per hour per address).

### Ideas to type in the video

1. Main idea: `I want an online food delivery app`
2. Vague idea: `An app to help farmers` (shows that unclear input still gives a plan, with the AI's assumptions listed
   on the Overview tab; the recorded sample plan for this idea lists, for example, "Users will have intermittent
   internet connectivity in rural fields, requiring offline data caching.")

### Shot list (about 7 minutes after trimming)

| Time | Shot (same order as part B) | Voice-over line |
| --- | --- | --- |
| 0:00 | Step 1: landing page, slow scroll to **How it works** and back up | "This is the AI Software Requirement and Planning Agent. Its rule: AI generates, algorithms verify." |
| 0:20 | Step 2: type `I want an online food delivery app`, open **Team and sprint settings**, set team size 1 to show the warning, **Reset to defaults** | "I type a one-line idea. The settings check that a sprint can hold the largest task." |
| 0:50 | Step 3: click **Generate plan**, show the 8 stages (cut the waiting to about 30 seconds, add the caption "real run: about 80 seconds") | "Purple AI stages write the content. Code stages check and schedule it." |
| 1:30 | Step 4: **Overview** tiles, **Assumptions**, **Two timelines, two questions** | "A complete plan, with 100 percent requirement coverage and the AI's assumptions listed." |
| 2:00 | Step 5: **Requirements**, then **Stories** | "Every task traces back to a story and a requirement." |
| 2:25 | Step 6: **Tasks**, open one critical task's **Task details** | "Story points from the AI, hours from our code." |
| 2:50 | Step 7: **Graph**, **Fit view**, **Critical path only** | "The critical path is computed by code and drawn in purple." |
| 3:15 | Step 8: **Timeline**, switch **Sprint plan (capacity)** and **CPM (unlimited people)** | "The real sprint plan versus the minimum with unlimited people." |
| 3:45 | Step 9: **Sprints**, what-if **Team size** 4 to 2, **Reset to plan** | "Two developers: the plan is recomputed instantly in the browser." |
| 4:15 | Step 10: **Risks**, show **EVIDENCE (CITED SIGNALS)** | "Every risk cites a measured signal; severity is computed by code." |
| 4:40 | Step 11: **Issues** | "Everything the code caught is listed here, never hidden." |
| 5:00 | Step 12: **Jira CSV** opened in Excel, then **Markdown** | "Exports for Jira and a readable Markdown document." |
| 5:30 | Step 13: **History**, open the run, **Re-plan with new team settings**, stages 1 to 5 **Reused** | "A re-plan reuses the saved stages and only re-schedules." |
| 6:00 | Vague idea: new run with `An app to help farmers` (cut the waiting), show **Assumptions** on **Overview** | "Even a vague idea gives a plan, and the assumptions are made visible." |
| 6:40 | Step 14: phone view (device toolbar), then a sample plan from **Try a sample plan** | "It works on a phone, and recorded sample plans open even without the AI." |
| 7:00 | Step 15: back to the landing page hero | "From one sentence to a verified plan. AI generates, algorithms verify." |

### Export and storage

- Clipchamp: **Export**, **1080p**. Name it `planning-agent-demo-backup.mp4`.
- Save it on the presentation laptop's desktop **and** on a USB stick, and share it in the team's drive.
- **Keep the video out of the git repository.** It is large, and the repository holds only code and documents. Do not
  save it inside the project folder.

---

## E. Gokul's 5 likely questions about the demo

1. **"Is this output real AI or hard-coded?"** Real. The run you just saw called Google Gemini live; the plan header
   shows the provider and model. The three sample plans are also real Gemini output, exported from stored runs (we
   replaced an earlier hand-written plan for exactly this reason). The offline mock model exists only for tests.
2. **"What happens if the AI creates a circular dependency?"** Kahn's algorithm detects it, Tarjan's algorithm finds
   exactly which tasks form the loop, the AI gets one chance to fix only those links, and if the loop is still there
   the run stops with "needs your decision" and the user ticks the link to remove. Every removal is logged on the
   Issues tab. In our 12 completed real runs, no loop occurred.
3. **"Why is the timeline longer than the critical path?"** The critical path (CPM) assumes unlimited people, so it is
   only a lower bound. The sprint plan respects the team's capacity (40 points per sprint for 4 developers). For the
   sample plan that is 30 working days against 12, a ratio of 2.50×, which means more people would shorten it.
4. **"Why did the numbers change from the slides?"** Each live run asks the AI again, so the content varies (in our
   evaluation the same idea gave 26, 31 and 26 tasks). Inside one plan, every number is computed and checked by code.
5. **"What if the internet or the AI fails during your demo?"** The site shows a clear message and offers a sample plan
   stored inside the website; a failed run can be retried from the failed stage without repeating finished stages. We
   also have a recorded video of a full live run.
