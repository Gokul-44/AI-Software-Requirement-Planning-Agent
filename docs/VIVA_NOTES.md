# Viva notes: the 15 most likely questions

Short answers for quick revision. Full explanations: [product/explanation.md](product/explanation.md). The five main
questions with one-minute answers: [QA_ANSWERS.md](QA_ANSWERS.md).

1. **What does your system do, in one sentence?**
   It turns a one-line software idea into a traceable, schedule-consistent plan (requirements, stories, tasks,
   estimates, dependencies, critical path, sprints, risks) and exports it to Jira CSV and Markdown.

2. **What does "AI generates, algorithms verify" mean in practice?**
   Gemini writes the content; our code assigns IDs, checks every reference, removes bad links, detects loops, computes
   the critical path, packs sprints and sets risk severity. The model never decides a schedule, a severity or a
   coverage number.

3. **How do you stop the model from returning garbage?**
   Every answer is checked with a Zod schema plus stage rules (counts, valid IDs, coverage). If it fails, the errors
   are sent back and the model retries, up to 2 times. Measured: 98.1% valid on the first try (105 of 107 calls).

4. **Why Tarjan's algorithm if Kahn already detects cycles?**
   Kahn only says "stuck"; the stuck set also contains tasks that merely wait behind a loop. Tarjan's SCC finds exactly
   the tasks in each loop (A → B → C → A plus C → D gives the loop {A, B, C} and D as blocked).

5. **What is your cycle repair policy, and why not just delete the weakest edge?**
   One model re-proposal limited to the loop's tasks, then the user chooses the edge to remove, and every removal is
   logged as an issue and a risk signal. Silent deletion would hide a planning defect, and model "confidence" is not
   calibrated.

6. **Explain CPM with your example.**
   Six tasks (8, 12, 8, 20, 4, 12 hours) give a minimum length of 52 h. The critical path is A → B → D → F; C has 4 h
   of slack and E has 20 h. All arithmetic is in whole hours, so "critical" means slack exactly 0.

7. **Why relaxed sprint packing instead of the deck's strict rule?**
   Strict packing forces every dependent task into a later sprint: the 6-task example needs 4 sprints for 16 points.
   Relaxed packing allows the same sprint if the chain fits the sprint's hours: 2 sprints. Strict is kept as an option.

8. **How do you guarantee packing terminates?**
   Settings must satisfy C ≥ 13 points and sprint hours ≥ the hours of a 13-point task, and the function checks every
   task first and throws `OversizedTaskError`. Under these rules an empty sprint always accepts a task, so the search
   ends at the latest one sprint after the highest sprint used.

9. **Is relaxed packing always at least as good as strict?**
   No. Property tests on 1,000 random graphs found that greedy relaxed packing needs more sprints in about 1.4% of
   cases. The smallest 4-task counterexample is pinned in a test, and the rule is checked statistically.

10. **Why do the timeline and the critical path differ?**
    CPM assumes unlimited people (a lower bound); the sprint plan respects team capacity. Food-delivery sample: 12
    working days versus 30, ratio 2.50×, so adding people would shorten the plan.

11. **How are risks grounded?**
    Code computes signals (value, threshold, severity). The model must cite at least one signal ID per risk; uncited
    risks are rejected, and severity is the highest severity of the cited signals. Example: RK-001 is high because
    SG-02 shows 6 downstream tasks against a threshold of 5.

12. **How did you evaluate the system, and with which model?**
    10 fixed ideas, 13 real runs, cache off, with gemini-3.5-flash-lite (the planned gemini-3.6-flash had no free daily
    quota left). 0 stage failures, 0 invalid references of 688, 0 cycles, 100% coverage, 79.8 s per run on average.

13. **What happens when the free Gemini quota runs out?**
    The run stops with "The free AI quota is used up right now", finished stages are kept, and the user can retry from
    the failed stage or open one of three real recorded sample plans stored in the website. The live site also limits
    runs: 3 per hour per visitor, 15 per day, 1 at a time.

14. **What are the honest limitations?**
    Free quota and slow runs; only one model evaluated; run-to-run variation (CPM CV 0.295 on three repeats); human
    rubric scores not collected; Jira import not tested on a real Jira site; simple model (one developer per task,
    finish-to-start only, fixed points-to-hours, assumed risk thresholds).

15. **What bug are you most proud of fixing?**
    Any of: the Windows argument bug (cmd caret escaping stored the idea as `^I^ want^ an^ ...`; we read the idea from a
    file, flag or environment variable and strip the carets); Gemini rejecting nested array limits (we turned them into
    description hints and kept Zod as the check); the white-on-purple contrast (4.2:1, fixed to 5.7:1 and 7.1:1).
