# Contributing

Thank you for helping with the AI Software Requirement & Planning Agent. This page is the short version of how we
work. Setup details are in [docs/guides/local-setup.md](docs/guides/local-setup.md).

## Set up

```bash
nvm use            # Node 24, see .nvmrc (Node 22.12 or newer works too)
npm install
npm run dev:mock   # API with a mock model and in-memory store, plus the website
```

No API key is needed for the mock stack.

## Workflow

1. Create a branch from `main`: `feat/<topic>`, `fix/<topic>` or `docs/<topic>`.
2. Make small, focused commits using [Conventional Commits](https://www.conventionalcommits.org/), for example
   `feat(scheduler): add tarjan scc` or `fix(web): bold label on large primary buttons`.
3. Add or update tests with the code.
4. Run the checks below, then open a pull request using the template.
5. One approving review from another member and a green CI run are needed to merge (squash merge).

## Checks that must pass

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run test:e2e   # optional locally, uses the mock stack
```

`npm run format` fixes formatting. CI runs lint, typecheck, test and build on every pull request, always with the
`replay` provider, so it never calls a real model.

## Ground rules

- **Algorithms verify, the model proposes.** Anything that can be checked by code (identifiers, references, cycles,
  schedules, signals) belongs in `packages/scheduler` or the pipeline validators, not in a prompt.
- **Contracts live in `packages/shared`.** A change there needs a review from everyone it affects.
- **Prompts are versioned.** Change a prompt by adding a new `stage<N>.v<k>.md` file, never by editing an old one.
- **No secrets in the repository.** `.env` files are gitignored; only `.env.example` files are committed. Never paste a
  key into an issue, a pull request or a log.
- **No real model calls in tests.** Use the mock or replay providers.
- Keep the app accessible: colours come from the design tokens in `apps/web/src/index.css`
  ([design system](docs/design/design-system.md)).

## Reporting bugs and ideas

Use the issue templates under **Issues**. For a bug, include the steps, what you expected, what happened, and the run id
if a plan run was involved.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
