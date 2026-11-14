# Presentation script (word for word)

About 30 minutes, 4 speakers, 25 slides ([slide outline](presentation/slide-outline.md)). Times are counted from the
start of the presentation. Speak slowly: about 130 words per minute. Every number here is from the repository; the
master reference is [product/explanation.md](product/explanation.md).

## Timing

| Speaker                | Slides         | Minutes | Clock         |
| ---------------------- | -------------- | ------- | ------------- |
| Saransh Sarang Naik    | 1-8            | 7       | 00:00 - 07:00 |
| Akshay Kumar Tapraniya | 9-15           | 7       | 07:00 - 14:00 |
| Shreya Tiwari          | 16-20          | 6       | 14:00 - 20:00 |
| Gokul Faleja           | 21-25 and demo | 10      | 20:00 - 30:00 |
| All four               | Q&A            | as asked | after 30:00  |

---

## Saransh Sarang Naik (00:00 - 07:00)

**[00:00, Slide 1: Title]**

"Good morning, respected examiners and everyone present. We are presenting our final-year project, the AI Software
Requirement and Planning Agent, from IIIT Vadodara, International Campus Diu. I am Saransh Sarang Naik. With me are
Akshay Kumar Tapraniya, Shreya Tiwari and Gokul Faleja. All four of us worked together on every part of this project:
planning, design, development, testing, deployment and documentation. I will explain the problem and our idea, Akshay
will explain how it works inside, Shreya will answer the five most important questions, and Gokul will show you the
live system."

**[00:45, Slide 2: The problem]**

"Let us start with the problem. A client usually describes software in one sentence, for example: 'I want an online
food delivery app'. Before a team can start, someone must turn that sentence into requirements, user stories, tasks,
estimates, dependencies and a sprint schedule. This takes days of a senior engineer's time. Two planners given the
same sentence produce two different plans. And usually nobody can say which requirement a task came from. Tools like
Jira are good at tracking a plan, but they do not create one. You might say: just ask a chatbot. A chatbot writes a
plan-like text in seconds, but it can invent task numbers, create circular dependencies, and give timelines that do
not add up. It sounds right, but it is not checked."

**[01:50, Slide 3: Objective]**

"So our objective was to build and deploy a web system that takes a one-line idea and returns a complete plan:
requirements, epics, user stories with acceptance criteria, tasks, estimates, a validated dependency graph, the
critical path, a sprint plan the team can really deliver, and a list of risks. The plan exports to Jira CSV and
Markdown. Two words describe the goal. Traceable: every task links to a story, and every story to its requirements.
Schedule-consistent: the timeline obeys every dependency and never overloads a sprint."

**[02:40, Slide 4: Our solution]**

"Here is our solution. You type your idea, you can set your team size and sprint length, and you press Generate plan.
For our food-delivery example, a real run with Google Gemini took 76 seconds. Across our whole evaluation the average
was about 80 seconds. You then get the full plan in nine tabs. If you change the team size, the schedule is
recomputed instantly in the browser. And three real plans recorded from the AI are built into the website, so they
open instantly even if the AI is not available."

**[03:25, Slide 5: AI generates, algorithms verify]**

"The rule behind the whole design is: AI generates, algorithms verify. Language models are good at writing and bad at
arithmetic. So the AI, Google Gemini, writes the creative parts: requirements, stories, tasks, estimates, which task
depends on which, and the wording of the risks. Our code decides everything that must be correct: the IDs, the
reference checks, loop detection, the critical path, the sprints, the risk severity and the coverage numbers. Every AI
answer is checked against a strict format, and if it is wrong we send the errors back and ask again, up to two times.
The model never decides a schedule, a severity or a coverage number."

**[04:20, Slide 6: The 8-stage pipeline]**

"The work happens in 8 stages. Stage 1 writes requirements. Stage 2 groups them into epics and user stories. Stage 3
splits stories into tasks, with one AI call per epic. Stage 4 estimates story points, and code converts them to hours.
Stage 5 proposes dependencies, and code checks them and looks for loops. Stage 6 is pure code: the critical path and
the sprint packing. In stage 7 code computes risk signals, the AI explains them, and code checks every citation. Stage
8 is pure code again: it assembles and validates the final plan. Every stage result is saved, so if you only change
the team settings, only stages 6 to 8 run again."

**[05:15, Slide 7: One idea through the pipeline]**

"Here is one real run of 'I want an online food delivery app'. Stage 1 gave 9 requirements, 6 functional and 3
non-functional, for example 'All user passwords must be securely hashed using bcrypt before storage', and 4
assumptions, for example that payments go through a third-party gateway. Stages 2 and 3 gave 4 epics, 9 stories and 30
tasks. Stage 4 gave 92 story points, which is 368 hours. Stage 5 gave 24 dependencies, with zero bad links and zero
loops. Stage 6 found a critical path of 72 hours, which is 12 working days, and packed the work into 3 sprints, 30
working days. Stage 7 produced 2 risks."

**[06:10, Slide 8: Traceability and coverage]**

"Finally, traceability. Every story lists the requirements it satisfies, and every task belongs to a story. Code
checks that every requirement has a story and every story has a task. If something is missing, the AI gets one
targeted retry, and if it is still missing, it is shown as a warning and a risk. It is never hidden. In our food
example, all 9 of 9 requirements reach a task. Now I hand over to Akshay, who will explain how the system is built and
how the algorithms work."

---

## Akshay Kumar Tapraniya (07:00 - 14:00)

**[07:00, Slide 9: Architecture and data flow]**

"Thank you, Saransh. This is our architecture. The user's browser loads our React website from Vercel. When you press
Generate plan, the website sends one request to our Express API, which runs on Render. The API immediately returns a
run ID and starts the pipeline in the background, and the browser checks the progress every 2 seconds. The API calls
Google Gemini for the AI stages and gets structured JSON back. Every result is validated and saved in PostgreSQL on
Neon. Three shared packages hold the data contracts, the scheduling algorithms and the exporters. The same scheduling
package also runs inside the browser, which is what makes the what-if panel instant. And the recorded sample plans
live inside the website, so they work even when the server is asleep."

**[08:00, Slide 10: Dependency graph and cycles]**

"Now the algorithms. A dependency means 'task A must finish before task B can start'. First, code throws away bad
links: links to tasks that do not exist, a task depending on itself, and duplicates. Each one is logged as an issue.
Then we check for loops. Kahn's algorithm is a fast test: it keeps removing tasks that wait for nothing. If it gets
stuck, there is a loop. But the stuck tasks also include innocent tasks that only wait behind the loop. So we run
Tarjan's strongly connected components algorithm, which finds exactly the tasks that form the loop. Then the AI gets
one chance to fix only those links. If the loop is still there, the user picks which link to remove, as you see on
this screen. Every removal is logged. In our 12 completed real runs, there were zero loops."

**[09:05, Slide 11: Critical path]**

"Next, the critical path, using the Critical Path Method. Look at this small example with 6 tasks, A to F, of 8, 12,
8, 20, 4 and 12 hours. Going forward, each task starts when its predecessors are done. D must wait for both B and C,
so it starts at hour 20. F finishes at hour 52. So with unlimited people the project needs at least 52 hours. Going
backward, we see how late each task could start without delaying the end. The difference is called slack. C has 4
hours of slack and E has 20. A, B, D and F have zero slack: that is the critical path. If any of them is late, the
whole project is late. We use whole hours, so 'zero slack' is an exact test. In the real food plan the critical path
is the payments chain, 72 hours."

**[10:10, Slide 12: Sprint packing]**

"Now we put tasks into sprints. We take tasks in a fixed priority order: smallest slack first, then the task that
unblocks the most work, then the ID. Here that is A, B, C, D, E, F. The original design deck used strict packing: a
task must go into a later sprint than all its predecessors. With 10 points per sprint, that needs 4 sprints for only
16 points of work. That is a design flaw, so we created relaxed packing: a task may share a sprint with its
predecessor if the chain still fits into the sprint's hours. The same example needs only 2 sprints. We fixed a second
flaw too: the deck's loop never ends if a task is bigger than a sprint. Our settings require room for a 13-point task,
and the code throws a clear error instead of looping forever."

**[11:20, Slide 13: Grounded risks]**

"Risks. A risk written freely by an AI is only an opinion. So our code first computes signals: measured facts with a
value, a threshold and a severity. For example, 'task T-015 has 6 downstream tasks and zero slack', where the
threshold is 5. The AI only explains the signals and suggests what to do, and every risk must cite a signal ID. Code
rejects risks without valid citations, and code sets the severity, as the highest severity of the cited signals. In
the food plan, risk RK-001 is high because it cites that payments signal. Every risk on the screen shows its evidence."

**[12:15, Slide 14: Tech stack]**

"Our tech stack. TypeScript everywhere, so the website and server share types and the scheduler. React with Vite and
Tailwind for the website, React Flow for the graph, and our own SVG Gantt chart. Node.js and Express for the API. Zod
checks the AI's answers, the API messages and the final plan. Google Gemini on the free tier, behind an interface,
with a mock and a replay provider for testing. PostgreSQL on Neon. Vercel and Render for hosting, and GitHub Actions
runs lint, type checks, 349 tests and the build on every push, without ever calling the real AI."

**[13:05, Slide 15: Evaluation results]**

"Finally, our measured results. We ran 10 fixed ideas, 13 real runs, with the cache turned off. 98.1 percent of AI
answers were valid on the first try, 105 of 107. Zero stages failed. Zero invalid references out of 688. Zero loops.
100 percent requirement coverage. About 80 seconds per run. To be honest: the model we planned had used up its free
daily quota, so all runs used gemini-3.5-flash-lite. And the human quality scoring and the Jira import test are still
pending. Now Shreya will answer the five questions that examiners most often ask."

---

## Shreya Tiwari (14:00 - 20:00)

**[14:00, Slide 16: Q1]**

"Thank you, Akshay. Question one: what is the main objective of our project, and what real-world problem does it
solve? Our objective was to build and deploy a web system that turns a one-line software idea into a complete project
plan that can be checked. The real-world problem is this: a client usually describes software in one sentence.
Turning that into requirements, user stories, tasks, estimates, dependencies and a sprint schedule takes days, and two
planners give two different plans. Jira tracks a plan, but does not create one. A chatbot can write a plan-like text,
but it can invent task numbers, create circular dependencies and give timelines that do not add up. Our system gives a
traceable plan, where every task links back to a requirement, and a schedule-consistent plan, which obeys every
dependency and the team's capacity. For the food-delivery idea it produced 9 requirements, 30 tasks and a 3-sprint
plan in 76 seconds."

**[15:10, Slide 17: Q2]**

"Question two: why did we choose this technology stack and methodology? Our methodology is one rule: AI generates,
algorithms verify. Models are good at writing and bad at arithmetic, so Gemini writes the content and tested code does
everything that must be correct. We used TypeScript everywhere, so the website and server share the same data
definitions and the same scheduling code. That is why changing the food plan from 4 developers to 2 instantly shows 5
sprints instead of 3, without calling the AI. Zod checks every AI answer against a strict schema. React and React Flow
give an interactive plan and graph. Express is small and simple. Neon, Vercel, Render and Gemini all have free tiers,
which matters for a student project. And GitHub Actions, Vitest and Playwright check everything on every push."

**[16:15, Slide 18: Q3]**

"Question three: the system architecture and data flow, which Akshay showed on this diagram. The browser loads our
React website from Vercel. Pressing Generate plan sends one request to our Express API on Render. The API returns a
run ID at once and runs the 8 stages in the background, and the browser checks progress every 2 seconds. The AI stages
call Gemini and get JSON back. Each answer is checked with Zod and our rules and saved in PostgreSQL on Neon. Stage 6
is pure code from our scheduler package. Stage 8 assembles one plan file, checks it again and saves everything in one
database transaction. The website shows the plan in nine tabs, and exports come as Jira CSV and Markdown. The recorded
sample plans are inside the website, so they work even when the API or the AI quota is unavailable."

**[17:20, Slide 19: Q4]**

"Question four: what major challenges did we face? First, two flaws in the original design. Strict packing put every
dependent task in a later sprint, so our 6-task example needed 4 sprints; our relaxed rule needs 2. And the packing
loop never ended if a task was bigger than a sprint; we added a settings rule and a clear error. Second, loops: the
original method also blamed innocent tasks, so we added Tarjan's algorithm and a repair policy. Third, the free Gemini
quota ran out. We added the sample plans, a clear quota message, retry from the failed stage, and we switched the
model. Fourth, Gemini rejected our schema with nested array limits, so we moved those limits into the descriptions and
let Zod enforce them. We also fixed a Windows bug that stored the idea with extra caret symbols, fixed a colour
contrast failure on our purple buttons, and our random tests found a rare packing anomaly in about 1.4 percent of
graphs, which we documented."

**[18:40, Slide 20: Q5]**

"Question five: limitations and future scope. Live runs depend on Gemini's free tier, which limits requests per day
and takes about 80 seconds a run. Our evaluation used only gemini-3.5-flash-lite. Results vary between runs: the same
idea gave 52, 84 and 52 critical-path hours in three runs. The human quality scoring is not done yet, and the Jira
import is not yet tested on a real Jira site. The schedule model is simple: one developer per task, finish-to-start
links only, and a fixed hours-per-point table. For the future: verify the Jira import and connect to the Jira API,
compare several models, let users edit tasks and re-schedule, split oversized tasks, learn hours per point from a
team's history, and add user accounts. Now Gokul will show you the live system."

---

## Gokul Faleja (20:00 - 30:00)

**[20:00, Slide 21: Live demo]**

"Thank you, Shreya. Now let me show you the real system. The address is on the screen, and you can scan the QR code to
open it on your phone."

Gokul now switches to the browser and follows [DEMO_WALKTHROUGH.md](DEMO_WALKTHROUGH.md), part B, word for word (steps
1 to 14, about 8 minutes 30 seconds). If anything fails, he uses part C of that file and, if needed, **Slide 22**
(backup screenshots) and the backup video.

**[28:30, Slide 23: Conclusion]**

"To conclude. A one-line idea becomes a traceable, schedule-consistent project plan in about 80 seconds. The AI
generates the content, and tested algorithms verify every reference, every loop, the schedule and every risk severity.
On 12 completed real runs we measured 98.1 percent valid AI answers on the first try, zero invalid references and 100
percent coverage. And it is deployed on free services, with sample plans and quota protection."

**[29:10, Slide 24: Future scope]**

"Next, we want to verify the Jira import and connect directly to Jira, collect human quality scores and compare
models, let users edit and split tasks, and learn estimates from a team's own history."

**[29:40, Slide 25: Thank you / Questions]**

"Thank you for your attention. All four of us are happy to answer your questions."

---

## Who answers which kind of examiner question

All four members know the whole project and can answer any question. This table only says who speaks first, so that
we do not talk over each other. If the first person is unsure, another member adds to the answer.

| Topic                                                        | Answers first          | Backup                 |
| ------------------------------------------------------------ | ---------------------- | ---------------------- |
| Problem, objective, scope, who would use it                  | Saransh Sarang Naik    | Shreya Tiwari          |
| Architecture, data flow, API, database, caching              | Akshay Kumar Tapraniya | Gokul Faleja           |
| Algorithms (Kahn, Tarjan, CPM, priority order, sprint packing, signals) | Akshay Kumar Tapraniya | Saransh Sarang Naik    |
| Frontend, website pages, the live demo                       | Gokul Faleja           | Akshay Kumar Tapraniya |
| Deployment (Vercel, Render, Neon, GitHub Actions), quota, limits | Gokul Faleja        | Saransh Sarang Naik    |
| Testing and evaluation (unit, property, end-to-end, measured results) | Shreya Tiwari   | Akshay Kumar Tapraniya |
| Limitations, honesty about pending work, future scope        | Shreya Tiwari          | Saransh Sarang Naik    |

Quick facts to have ready: [VIVA_NOTES.md](VIVA_NOTES.md) and [QA_ANSWERS.md](QA_ANSWERS.md).
