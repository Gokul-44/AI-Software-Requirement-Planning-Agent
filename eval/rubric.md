# Human scoring rubric (MASTER_PLAN E3)

The script `npm run eval` measures everything a program can measure. This rubric covers what only a person can judge. Each plan is scored 1 to 5 on five criteria by **two raters**. Neither rater may be the person who wrote the prompts. Scores are averaged per criterion, and the disagreement (the absolute difference between the two raters) is recorded.

## How to score

1. Open the plan in the app (History, or the run id from the `run_id` column of `eval/results/<date>_<model>.csv`) and read it in the order below. Read the plan itself, not this file's examples.
2. Score each criterion on its own, from 1 to 5, using the anchors below. Use whole numbers.
3. Write one short sentence of evidence for every score of 1, 2 or 5 (what you saw and where, for example "R-007 has no story").
4. Do not talk to the other rater until both sheets are submitted. Then copy both into the results table.
5. If the two scores for one criterion differ by 2 or more, discuss and note the reason in the comment column. Keep both original scores.

## Criteria and anchors

| Criterion                       | Where to look           | 1 (poor)                                                                         | 3 (acceptable)                                                                 | 5 (excellent)                                                                                                    |
| ------------------------------- | ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1. Completeness of requirements | Requirements tab        | Major needs of the idea are missing, or most requirements are vague or invented. | Main needs are there; some obvious gaps (for example security or performance). | Functional and non-functional needs cover the idea; vague ideas get explicit assumptions, nothing invented.      |
| 2. Story quality (INVEST)       | Stories tab             | Stories are tasks in disguise, huge, or have no testable acceptance criteria.    | Most stories are small and valuable; some criteria are vague.                  | Stories are Independent, Negotiable, Valuable, Estimable, Small and Testable; criteria can be checked yes or no. |
| 3. Task granularity             | Tasks tab               | Tasks are either whole features or trivial steps; estimates are unbelievable.    | Most tasks are one to a few days of work; a few are too large or too small.    | Tasks are clear single pieces of work, sized sensibly, with the data and the endpoints each story needs.         |
| 4. Dependency sensibility       | Graph tab, Timeline tab | Many edges are wrong or missing; the order could not be built in practice.       | Mostly sensible order; a few odd or missing edges.                             | Every edge has a real reason, nothing obvious is missing, and the critical path makes sense to a developer.      |
| 5. Risk usefulness              | Risks tab               | Risks are generic, or repeat the signals without saying what to do.              | Risks relate to the plan; mitigations are generic.                             | Each risk is specific to this plan, grounded in its signals, and has a mitigation the team could act on.         |

## Score sheet (one copy per plan and rater)

Plan: ____________________ (idea and run id)  
Rater: ____________________ Date: ____________

| Criterion                       | Score (1-5) | Evidence (required for 1, 2 and 5) |
| ------------------------------- | ----------- | ---------------------------------- |
| 1. Completeness of requirements |             |                                    |
| 2. Story quality (INVEST)       |             |                                    |
| 3. Task granularity             |             |                                    |
| 4. Dependency sensibility       |             |                                    |
| 5. Risk usefulness              |             |                                    |

## Results table (fill in after both raters are done)

One row per plan. Mean = average of the two raters. Gap = absolute difference between them.

| Idea | Run id | Criterion | Rater A | Rater B | Mean | Gap | Comment |
| ---- | ------ | --------- | ------- | ------- | ---- | --- | ------- |
|      |        | 1         |         |         |      |     |         |
|      |        | 2         |         |         |      |     |         |
|      |        | 3         |         |         |      |     |         |
|      |        | 4         |         |         |      |     |         |
|      |        | 5         |         |         |      |     |         |

Per plan, also record the overall mean of the five criterion means and the largest gap. For the report, give the mean score per criterion across all plans, and the share of scores where the raters differed by 2 or more.

## Rules

- Only plans that were actually generated are scored. Never fill in a score for a plan nobody has read.
- Score the plan the model produced. Do not repair it first.
- Rate the vague idea ("An app to help farmers") on how well the plan states its assumptions, not on whether it guessed the right product.
