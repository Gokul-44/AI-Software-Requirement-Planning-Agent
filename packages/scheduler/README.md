# @spm/scheduler

Pure, synchronous scheduling algorithms: no I/O, no randomness, no model calls. This is the "algorithms verify" half of
the project. The same code runs in the API and in the browser (what-if planning).

## Main functions

| Function                     | What it does                                                            |
| ---------------------------- | ----------------------------------------------------------------------- |
| `validateEdges`              | drops unknown ids, self-loops and duplicate dependency edges            |
| `checkAcyclic`               | Kahn's algorithm plus Tarjan's strongly connected components for cycles |
| `computeCpm`, `criticalPath` | critical path method in integer hours (earliest/latest start, slack)    |
| `priorityOrder`              | deterministic task order used by the packer                             |
| `packSprints`                | capacity-feasible sprint plan, `relaxed` (default) or `strict` packing  |
| `computeCoverage`            | requirement-to-story-to-task traceability checks                        |
| `findDuplicateTitles`        | near-duplicate task detection                                           |
| `computeSignals`             | numeric risk signals (capacity, fan-in, layer imbalance and more)       |
| `schedulePlan`               | the single entry point that runs all of the above                       |

## Test

```bash
npm test -w @spm/scheduler
```

The suite has known-answer tests built by hand and property-based tests ([fast-check](https://fast-check.dev)) over
1,000 random task graphs of up to 150 tasks, checking the CPM, ordering and sprint-packing invariants (for example, no
task starts before its predecessors finish and critical tasks have exactly zero slack).
