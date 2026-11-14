# @spm/web

The React website: enter an idea, watch the eight stages run, and explore the plan.

## Stack

React 19, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS 4, `@xyflow/react` with dagre for the dependency
graph, and a custom SVG Gantt chart.

## Layout

| Folder            | Purpose                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/`      | Home, run progress, history and the plan view (Overview, Requirements, Stories, Tasks, Graph, Timeline, Sprints, Risks, Issues) |
| `src/components/` | shared UI: app shell, Gantt, what-if panel, export buttons, cycle resolver                                                      |
| `src/api/`        | all data access: real API client, recorded-plan (fixture) backend, polling hooks                                                |
| `src/lib/`        | pure helpers with tests: Gantt layout, what-if re-planning, colours, friendly errors                                            |
| `public/golden/`  | recorded sample plans served as static files (the fallback when the API or quota is down)                                       |

All colours are design tokens defined once in `src/index.css`; see
[docs/design/design-system.md](../../docs/design/design-system.md).

## Run and test

```bash
npm run dev:web        # from the repository root: website only, recorded sample plans
npm run dev:mock       # website plus API with a mock model
npm test -w @spm/web
```

Without `VITE_API_BASE_URL` the site runs on the recorded plans and simulates a run in the browser. Set it to
`http://localhost:3001/api` to use the real API.
