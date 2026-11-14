import clsx from 'clsx';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { USE_FIXTURE } from '../api/client';
import { errorMessage } from '../api/errors';
import { useCreateProject, useGolden, useProjects } from '../api/hooks';
import { ConfigForm } from '../components/ConfigForm';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  SectionTitle,
  Spinner,
} from '../components/ui';
import {
  IDEA_MAX,
  IDEA_MIN,
  defaultFormValues,
  ideaError,
  validateConfigForm,
} from '../lib/configForm';
import { formatDate } from '../lib/format';

const EXAMPLES = [
  'An online food delivery app where customers order from local restaurants and track couriers live.',
  'A hospital appointment booking system for patients, doctors and reception staff.',
  'A library management system with book lending, reservations and fine tracking.',
];

export function HomePage() {
  const navigate = useNavigate();
  const [idea, setIdea] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [form, setForm] = useState(defaultFormValues);
  const [accessCode, setAccessCode] = useState('');
  const create = useCreateProject();
  const golden = useGolden();
  const projects = useProjects();

  const check = useMemo(() => validateConfigForm(form), [form]);
  const trimmed = idea.trim();
  const ideaProblem = ideaError(idea);
  const configProblems = Object.keys(check.errors).length;
  const canSubmit =
    trimmed.length >= IDEA_MIN && !ideaProblem && configProblems === 0 && !create.isPending;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    create.mutate(
      {
        idea_text: trimmed,
        ...(Object.keys(check.patch).length > 0 ? { config: check.patch } : {}),
        ...(accessCode.trim() ? { access_code: accessCode.trim() } : {}),
      },
      { onSuccess: (res) => navigate(`/runs/${res.run_id}`) },
    );
  }

  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          From a one-line idea to a plan you can verify
        </h1>
        <p className="mt-3 text-base text-slate-600">
          Describe the software you want. The agent proposes requirements, stories, tasks and
          estimates; deterministic code then checks every reference, finds the critical path and
          packs the work into sprints your team can actually deliver.
        </p>
      </section>

      <Card>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <label htmlFor="idea" className="text-sm font-semibold text-slate-900">
              Your idea
            </label>
            <textarea
              id="idea"
              rows={4}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="e.g. An online food delivery platform for one city: customers order, restaurants prepare, couriers deliver."
              aria-invalid={ideaProblem ? true : undefined}
              aria-describedby="idea-help"
              className={clsx(
                'mt-2 w-full resize-y rounded-lg border bg-white px-3 py-2.5 text-sm shadow-sm',
                ideaProblem ? 'border-red-400 ring-1 ring-red-200' : 'border-slate-300',
              )}
            />
            <div
              id="idea-help"
              className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span className={ideaProblem ? 'text-red-600' : 'text-slate-500'}>
                {ideaProblem ?? `Between ${IDEA_MIN} and ${IDEA_MAX} characters.`}
              </span>
              <span
                className={clsx(
                  'tabular-nums',
                  trimmed.length > IDEA_MAX ? 'text-red-600' : 'text-slate-400',
                )}
              >
                {trimmed.length} / {IDEA_MAX}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="text-xs text-slate-500">Try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setIdea(ex)}
                  className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                  title={ex}
                >
                  {ex.length > 52 ? `${ex.slice(0, 52)}…` : ex}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setShowConfig((v) => !v)}
              aria-expanded={showConfig}
              aria-controls="config-panel"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span>
                <span className="text-sm font-semibold text-slate-900">
                  Team and sprint settings
                </span>
                <span className="ml-2 text-xs text-slate-500">
                  {`${form.team_size} devs · ${form.sprint_length_days}-day sprints · ${form.focus_hours_per_day} focus h/day · ${form.pack_mode} packing`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {configProblems > 0 ? (
                  <Badge className="bg-red-50 text-red-700 ring-red-200">
                    {configProblems} problem{configProblems > 1 ? 's' : ''}
                  </Badge>
                ) : null}
                <span
                  aria-hidden="true"
                  className={clsx(
                    'text-slate-400 transition-transform',
                    showConfig && 'rotate-180',
                  )}
                >
                  ▾
                </span>
              </span>
            </button>
            {showConfig ? (
              <div id="config-panel" className="space-y-4 border-t border-slate-200 px-4 py-4">
                <ConfigForm values={form} result={check} onChange={setForm} />
                {!USE_FIXTURE ? (
                  <div className="max-w-xs">
                    <label htmlFor="access" className="block text-xs font-medium text-slate-700">
                      Access code (only if the server asks for one)
                    </label>
                    <input
                      id="access"
                      type="password"
                      autoComplete="off"
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm shadow-sm"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {create.isError ? (
            <ErrorState title="The run could not be started" error={create.error} />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {USE_FIXTURE
                ? 'Fixture mode: the run is simulated and finishes with the sample plan below.'
                : 'A live run calls the language model and usually takes a few minutes.'}
            </p>
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {create.isPending ? <Spinner label="Starting" /> : 'Generate plan'}
            </Button>
          </div>
        </form>
      </Card>

      <section>
        <SectionTitle
          title="Golden demos"
          hint="Pre-computed plans. No language model is called, so they open instantly."
        />
        {golden.isLoading ? (
          <Spinner label="Loading demos" />
        ) : golden.isError ? (
          <ErrorState
            title="Could not load the golden demos"
            error={golden.error}
            onRetry={() => void golden.refetch()}
          />
        ) : (golden.data ?? []).length === 0 ? (
          <EmptyState title="No golden demos yet">
            Golden plans are recorded with the pipeline and appear here once they exist.
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {golden.data?.map((g) => (
              <Link
                key={g.run_id}
                to={`/runs/${g.run_id}/plan`}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-200 hover:shadow-md"
              >
                <div>
                  <Badge className="bg-brand-50 text-brand-700 ring-brand-200">Golden demo</Badge>
                  <p className="mt-3 line-clamp-4 text-sm text-slate-800">{g.idea_text}</p>
                </div>
                <span className="mt-4 text-sm font-medium text-brand-600 group-hover:underline">
                  Open plan →
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {(projects.data ?? []).length > 0 ? (
        <section>
          <SectionTitle title="Recent runs" />
          <Card padded={false}>
            <ul className="divide-y divide-slate-100">
              {projects.data?.map((p) => (
                <li key={p.id}>
                  <Link
                    to={
                      p.latest_run?.status === 'succeeded'
                        ? `/runs/${p.latest_run.id}/plan`
                        : `/runs/${p.latest_run?.id ?? ''}`
                    }
                    className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-slate-800">{p.idea_text}</span>
                      <span className="block text-xs text-slate-400">
                        {formatDate(p.created_at)}
                      </span>
                    </span>
                    <Badge>{p.latest_run?.status ?? 'no run'}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : projects.isError ? (
        <p className="text-xs text-slate-400">
          History unavailable: {errorMessage(projects.error)}
        </p>
      ) : null}
    </div>
  );
}
