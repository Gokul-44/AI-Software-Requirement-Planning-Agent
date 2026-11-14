# @spm/shared

The contracts of the project, written as [Zod](https://zod.dev) schemas. Every other workspace imports its types and
validators from here, so there is a single source of truth.

## What it contains

| Area              | Main exports                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Identifiers       | ID patterns for `R-001`, `E-001`, `S-001`, `T-001` and so on (`ids.ts`)                        |
| Configuration     | `ConfigSchema`, `DEFAULT_CONFIG`, `resolveConfig` (team size, sprint length, points to hours)  |
| Stage outputs     | one strict schema per model stage (`stages.ts`)                                                |
| The plan          | `PlanSchema` (`plan.json` version 1.0) and `assertPlanIntegrity` / `findPlanIntegrityProblems` |
| API               | request and response DTOs and the error envelope (`api.ts`)                                    |
| Structured output | `stageJsonSchema`, `toJsonSchema`: JSON Schema generated from the Zod schemas                  |

## Test

```bash
npm test -w @spm/shared
```

The tests check the schemas, the integrity rules of a plan and the generated JSON Schema. A change to a contract needs
a review from everyone it affects.
