# Evaluation

What was measured, and where the full results are.

- **Protocol and metrics:** section E of the [design document](../design/design-document.md).
- **Ideas used:** [`eval/ideas.json`](../../eval/ideas.json) (10 fixed software ideas).
- **Full results (tables, per-run rows):** [`eval/results/2026-11-15_gemini-3.5-flash-lite.md`](../../eval/results/2026-11-15_gemini-3.5-flash-lite.md)
  and the matching [CSV](../../eval/results/2026-11-15_gemini-3.5-flash-lite.csv); raw files are in
  [`eval/results/raw`](../../eval/results/raw).
- **Human rubric** (five criteria, two raters): [`eval/rubric.md`](../../eval/rubric.md).

Run it yourself (calls the real model, so it needs a Gemini key): `npm run eval -- --limit 10`.

## Measured numbers (gemini-3.5-flash-lite, 13 runs, 2026-11-15)

| Metric                          | Result                                     |
| ------------------------------- | ------------------------------------------ |
| Schema-valid on the first try   | 98.1% (105 of 107 model calls)             |
| Stage failures after retries    | 0 of 98 stages                             |
| Invalid references              | 0 of 688 proposed                          |
| Dependency cycles before repair | 0 of 12 completed runs                     |
| Requirement coverage            | 100% in every completed run                |
| Duplicate tasks                 | 0%                                         |
| Tasks per story                 | 3.33 on average (range 2 to 5)             |
| Run time                        | 79.8 s on average, 106.9 s longest         |
| Consistency across 3 repeats    | task count CV 0.104, CPM duration CV 0.295 |

The free Gemini quota limited the choice of model; no result is claimed for any other model. The human rubric scores
are still to be collected.
