import clsx from 'clsx';
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  FileDown,
  GitBranch,
  Network,
  PencilLine,
  Route,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { USE_FIXTURE } from '../api/client';
import { useCreateProject, useGolden, useGoldenPlan, useProjects } from '../api/hooks';
import { ConfigForm } from '../components/ConfigForm';
import { Badge, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { buttonClass } from '../lib/buttonClass';
import {
  IDEA_MAX,
  IDEA_MIN,
  defaultFormValues,
  ideaError,
  validateConfigForm,
} from '../lib/configForm';
import { formatDate, formatDays, plural } from '../lib/format';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { StatusBadge } from '../components/StatusBadge';

const EXAMPLES = [
  {
    label: 'Food delivery',
    text: 'An online food delivery app where customers order from local restaurants and track couriers live.',
  },
  {
    label: 'Hospital booking',
    text: 'A hospital appointment booking system for patients, doctors and reception staff.',
  },
  {
    label: 'Library system',
    text: 'A library management system with book lending, reservations and fine tracking.',
  },
  {
    label: 'Fitness tracker',
    text: 'A fitness tracking app with workout plans, progress charts and weekly goals for members and coaches.',
  },
];

const STEPS = [
  {
    icon: PencilLine,
    title: 'Describe',
    text: 'Write your software idea in one line. Add your team size and sprint length if you know them.',
  },
  {
    icon: Wand2,
    title: 'AI drafts',
    text: 'The model proposes requirements, epics, user stories, tasks, estimates, dependencies and risks.',
  },
  {
    icon: ShieldCheck,
    title: 'Algorithms verify',
    text: 'Code checks every reference, rejects cycles, finds the critical path and packs the sprints.',
  },
];

const FEATURES = [
  {
    icon: GitBranch,
    title: 'Full traceability',
    text: 'Every requirement links to stories and tasks, and the coverage check shows what is missing.',
  },
  {
    icon: Network,
    title: 'Dependency graph',
    text: 'A validated graph of task dependencies. Unknown references and cycles are caught, not guessed.',
  },
  {
    icon: Route,
    title: 'Critical path',
    text: 'The longest zero-slack chain is computed by code and highlighted in the graph and the Gantt chart.',
  },
  {
    icon: CalendarRange,
    title: 'Sprint plan',
    text: 'Work is packed into sprints your team can deliver, with a what-if panel for team size.',
  },
  {
    icon: ShieldAlert,
    title: 'Grounded risks',
    text: 'Risk severity comes from computed signals, and every risk cites the signals behind it.',
  },
  {
    icon: FileDown,
    title: 'Jira export',
    text: 'Download a Jira-ready CSV or a Markdown plan, or the full plan as JSON.',
  },
];

const TRUST = [
  'The model never decides a schedule, a severity or a coverage number.',
  'Every model answer is checked against a strict schema, with automatic repair retries.',
  'Cycles, dangling references and capacity violations are reported as issues, not hidden.',
  'Every step is logged, so a plan can be explained and reproduced.',
];

function Section({
  id,
  title,
  lead,
  children,
}: {
  id?: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="mx-auto w-full max-w-[1400px] scroll-mt-24 px-4 py-12 sm:px-6 sm:py-16"
    >
      <div className="max-w-2xl">
        <h2 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">{title}</h2>
        {lead ? <p className="mt-2 text-base text-muted">{lead}</p> : null}
      </div>
      <div className="mt-8">{children}</div>
    </section>
  );
}

export function HomePage() {
  useDocumentTitle(null);
  const navigate = useNavigate();
  const ideaRef = useRef<HTMLTextAreaElement>(null);
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
    <>
      <section id="new" className="spm-hero scroll-mt-16 text-sand-50">
        <div className="mx-auto max-w-[1400px] px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-24">
          <div className="spm-fade-up mx-auto max-w-3xl text-center">
            <Badge className="bg-sand-100/10 text-sand-200 ring-sand-300/25">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AI generates, algorithms verify
            </Badge>
            <h1 className="mt-5 text-4xl font-bold tracking-tighter text-balance text-sand-50 sm:text-6xl">
              From a one-line idea to a plan you can verify
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base text-sand-200 sm:text-lg">
              Describe the software you want. The agent drafts requirements, stories, tasks and
              estimates, then deterministic code finds the critical path and packs sprints your team
              can deliver.
            </p>
          </div>

          <form
            onSubmit={submit}
            noValidate
            className="spm-glass spm-fade-up mx-auto mt-10 max-w-3xl rounded-3xl p-4 sm:p-6"
            style={{ animationDelay: '0.08s' }}
          >
            <label htmlFor="idea" className="block text-sm font-semibold text-sand-50">
              Describe your software idea in one line
            </label>
            <textarea
              id="idea"
              ref={ideaRef}
              rows={3}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="e.g. An online food delivery platform for one city: customers order, restaurants prepare, couriers deliver."
              aria-invalid={ideaProblem ? true : undefined}
              aria-describedby="idea-help"
              className={clsx(
                'mt-2 w-full resize-y rounded-2xl border bg-sand-50 px-4 py-3 text-base text-text shadow-inner placeholder:text-muted',
                ideaProblem ? 'border-red-500 ring-2 ring-red-300' : 'border-sand-300',
              )}
            />
            <div
              id="idea-help"
              className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span className={ideaProblem ? 'font-medium text-red-200' : 'text-sand-300'}>
                {ideaProblem ?? `Between ${IDEA_MIN} and ${IDEA_MAX} characters.`}
              </span>
              <span
                className={clsx(
                  'tabular-nums',
                  trimmed.length > IDEA_MAX ? 'text-red-200' : 'text-sand-300',
                )}
              >
                {trimmed.length} / {IDEA_MAX}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-sand-300">Try an example:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  title={ex.text}
                  onClick={() => {
                    setIdea(ex.text);
                    ideaRef.current?.focus();
                  }}
                  className="rounded-full border border-sand-300/30 bg-sand-100/5 px-3 py-1 text-xs font-medium text-sand-100 transition-colors hover:border-sand-300/60 hover:bg-sand-100/15"
                >
                  {ex.label}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-sand-300/20 bg-brand-green-950/30">
              <button
                type="button"
                onClick={() => setShowConfig((v) => !v)}
                aria-expanded={showConfig}
                aria-controls="config-panel"
                className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="text-sm font-semibold text-sand-50">
                    Team and sprint settings
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-sand-300">
                    {`${form.team_size} devs · ${form.sprint_length_days}-day sprints · ${form.focus_hours_per_day} focus h/day · ${form.pack_mode} packing`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {configProblems > 0 ? (
                    <Badge className="bg-red-50 text-red-800 ring-red-200">
                      {configProblems} problem{configProblems > 1 ? 's' : ''}
                    </Badge>
                  ) : null}
                  <ChevronDown
                    aria-hidden="true"
                    className={clsx(
                      'h-5 w-5 text-sand-300 transition-transform',
                      showConfig && 'rotate-180',
                    )}
                  />
                </span>
              </button>
              {showConfig ? (
                <div
                  id="config-panel"
                  className="space-y-4 rounded-b-2xl border-t border-sand-300/20 bg-surface px-4 py-4 text-text"
                >
                  <ConfigForm values={form} result={check} onChange={setForm} />
                  {!USE_FIXTURE ? (
                    <div className="max-w-xs">
                      <label
                        htmlFor="access"
                        className="block text-xs font-medium text-brand-green-800"
                      >
                        Access code (only if the server asks for one)
                      </label>
                      <input
                        id="access"
                        type="password"
                        autoComplete="off"
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-sand-400 bg-surface px-2.5 py-1.5 text-sm shadow-sm"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {create.isError ? (
              <div className="mt-4 text-left text-text">
                <ErrorState error={create.error} />
              </div>
            ) : null}

            <div className="mt-5 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-sand-300">
                {USE_FIXTURE
                  ? 'Fixture mode: the run is simulated and finishes with the sample plan.'
                  : 'A live run calls the language model and can take a few minutes.'}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <a href="#demos" className={buttonClass('outline-light', 'lg')}>
                  Try a sample plan
                </a>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={buttonClass('primary', 'lg')}
                >
                  {create.isPending ? 'Starting…' : 'Generate plan'}
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      <Section
        id="how"
        title="How it works"
        lead="Three steps from a sentence to a plan, with the model and the algorithms each doing what they are good at."
      >
        <ol className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="spm-lift rounded-3xl border border-border bg-surface p-6 shadow-card"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-green-900 text-sand-100">
                  <s.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold text-muted">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-text">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <div className="bg-sand-200/70">
        <Section
          id="features"
          title="Everything a project plan needs"
          lead="Not a wall of generated text: a structured plan that links together and can be checked."
        >
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="spm-lift rounded-3xl border border-border bg-surface p-6 shadow-card"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-green-100 text-brand-green-800">
                  <f.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-text">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.text}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section
        id="demos"
        title="Try a sample plan"
        lead="Recorded plans open instantly. No language model is called."
      >
        {golden.isLoading ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-56 rounded-3xl" />
            ))}
          </div>
        ) : golden.isError ? (
          <ErrorState
            title="Could not load the sample plans"
            error={golden.error}
            onRetry={() => void golden.refetch()}
          />
        ) : (golden.data ?? []).length === 0 ? (
          <EmptyState
            title="No sample plans yet"
            action={
              <a href="#new" className={buttonClass('primary', 'md')}>
                Generate your own plan
              </a>
            }
          >
            Sample plans are recorded with the pipeline and appear here once they exist.
          </EmptyState>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {golden.data?.map((g) => (
              <GoldenCard key={g.run_id} runId={g.run_id} idea={g.idea_text} />
            ))}
          </div>
        )}
      </Section>

      <section className="bg-brand-green-900 text-sand-100">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-sand-50 sm:text-3xl">
              Why you can trust it
            </h2>
            <p className="mt-3 text-lg font-medium text-accent-200">
              AI generates, algorithms verify.
            </p>
            <p className="mt-2 text-sm text-sand-300">
              Language models are good at drafting and bad at arithmetic. So the model writes the
              content, and tested code does everything that must be correct.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {TRUST.map((t) => (
              <li key={t} className="spm-glass flex gap-3 rounded-2xl p-4 text-sm text-sand-100">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-sand-300"
                  aria-hidden="true"
                />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {(projects.data ?? []).length > 0 ? (
        <Section title="Your recent runs">
          <ul className="grid gap-3 md:grid-cols-3">
            {projects.data?.slice(0, 3).map((p) => (
              <li key={p.id}>
                <Link
                  to={
                    p.latest_run?.status === 'succeeded'
                      ? `/runs/${p.latest_run.id}/plan`
                      : `/runs/${p.latest_run?.id ?? ''}`
                  }
                  className="spm-lift flex h-full flex-col justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
                >
                  <span className="line-clamp-2 text-sm font-medium text-text">{p.idea_text}</span>
                  <span className="flex items-center justify-between gap-2 text-xs text-muted">
                    {formatDate(p.created_at)}
                    <StatusBadge status={p.latest_run?.status ?? null} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Link to="/history" className="text-sm font-semibold text-accent-700 hover:underline">
              See all history →
            </Link>
          </div>
        </Section>
      ) : null}
    </>
  );
}

function GoldenCard({ runId, idea }: { runId: string; idea: string }) {
  const plan = useGoldenPlan(runId);
  const p = plan.data;
  const stats: { label: string; value: string }[] = p
    ? [
        { label: 'Requirements', value: String(p.requirements.length) },
        { label: 'Tasks', value: String(p.tasks.length) },
        { label: 'Sprints', value: String(p.schedule.capacity_plan.sprint_count) },
        { label: 'Days', value: formatDays(p.schedule.capacity_plan.duration_days) },
      ]
    : [];
  return (
    <Link
      to={`/runs/${runId}/plan`}
      className="spm-lift group flex flex-col justify-between rounded-3xl border border-border bg-surface p-6 shadow-card"
    >
      <div>
        <Badge className="bg-brand-green-100 text-brand-green-800 ring-brand-green-200">
          Sample plan
        </Badge>
        <p className="mt-4 line-clamp-4 text-base font-medium text-text">{idea}</p>
      </div>
      <div className="mt-5">
        {p ? (
          <dl className="grid grid-cols-4 gap-2 rounded-2xl bg-sand-100 p-3 text-center">
            {stats.map((s) => (
              <div key={s.label}>
                <dd className="text-lg font-semibold text-text tabular-nums">{s.value}</dd>
                <dt className="text-[11px] text-muted">{s.label}</dt>
              </div>
            ))}
          </dl>
        ) : (
          <Skeleton className="h-16 rounded-2xl" />
        )}
        <p className="mt-2 text-xs text-muted">
          {p
            ? `${plural(p.stories.length, 'story', 'stories')} · ${plural(p.risks.length, 'risk')} · ${plural(p.run.config.team_size, 'dev')}`
            : ' '}
        </p>
        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700 group-hover:underline">
          Open plan
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
    </Link>
  );
}
