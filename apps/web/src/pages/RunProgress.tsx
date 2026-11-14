import clsx from 'clsx';
import { AlertCircle, ArrowLeft, Check, Clock, Pause, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { USE_FIXTURE } from '../api/client';
import { useRunStatus } from '../api/hooks';
import type { RunStatus } from '../api/types';
import { CycleResolver } from '../components/CycleResolver';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/toastContext';
import { Badge, Button, Card, ErrorState, GoldenDemoButton, Skeleton } from '../components/ui';
import { buttonClass } from '../lib/buttonClass';
import { formatClock, formatDuration } from '../lib/format';
import { friendlyCode } from '../lib/friendlyError';
import { useDocumentTitle } from '../lib/useDocumentTitle';

const STAGES: {
  label: string;
  who: 'AI' | 'Code' | 'AI + code';
  doing: string;
  text: string;
}[] = [
  {
    label: 'Requirement analysis',
    who: 'AI',
    doing: 'Writing requirements…',
    text: 'Turns the idea into functional and non-functional requirements and lists assumptions.',
  },
  {
    label: 'Epics and stories',
    who: 'AI',
    doing: 'Drafting epics and user stories…',
    text: 'Groups requirements into epics and user stories with acceptance criteria.',
  },
  {
    label: 'Task decomposition',
    who: 'AI',
    doing: 'Breaking stories into tasks…',
    text: 'Splits every story into developer tasks, one call per epic.',
  },
  {
    label: 'Effort estimation',
    who: 'AI',
    doing: 'Estimating effort…',
    text: 'Assigns story points; code converts them to hours.',
  },
  {
    label: 'Dependencies',
    who: 'AI + code',
    doing: 'Mapping dependencies and checking for loops…',
    text: 'The model proposes edges; code rejects bad references and checks for cycles.',
  },
  {
    label: 'Scheduling',
    who: 'Code',
    doing: 'Finding the critical path and packing sprints…',
    text: 'Critical path (CPM), priority order and capacity-feasible sprint packing.',
  },
  {
    label: 'Risks',
    who: 'AI + code',
    doing: 'Assessing risks from computed signals…',
    text: 'Code computes risk signals; the model explains them; code checks every citation.',
  },
  {
    label: 'Assemble and export',
    who: 'Code',
    doing: 'Assembling and checking the plan…',
    text: 'Builds and validates plan.json for the UI and the exports.',
  },
];

type Entry = RunStatus['stages'][number];
const STATUS_TEXT: Record<Entry['status'], string> = {
  pending: 'Waiting',
  running: 'Running',
  succeeded: 'Done',
  cached: 'Reused',
  failed: 'Failed',
};

function StageIcon({
  status,
  n,
  waiting,
}: {
  status: Entry['status'];
  n: number;
  waiting: boolean;
}) {
  const base =
    'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold';
  if (status === 'succeeded' || status === 'cached')
    return (
      <span className={clsx(base, 'bg-emerald-600 text-white')}>
        <Check className="h-4.5 w-4.5" aria-hidden="true" />
      </span>
    );
  if (status === 'failed')
    return (
      <span className={clsx(base, 'bg-red-700 text-white')}>
        <X className="h-4.5 w-4.5" aria-hidden="true" />
      </span>
    );
  if (status === 'running' && waiting)
    return (
      <span className={clsx(base, 'bg-amber-500 text-amber-950 ring-4 ring-amber-100')}>
        <Pause className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  if (status === 'running')
    return (
      <span
        className={clsx(
          base,
          'spm-pulse bg-brand-green-800 text-sand-50 ring-4 ring-brand-green-200',
        )}
      >
        {n}
      </span>
    );
  return <span className={clsx(base, 'bg-sand-200 text-muted ring-1 ring-sand-400')}>{n}</span>;
}

/** Seconds since the run was first seen, kept in sessionStorage so a reload does not reset it. */
function useElapsed(runId: string, active: boolean): number {
  const [start] = useState(() => {
    const key = `spm.run.start.${runId}`;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) return Number(saved);
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      /* storage blocked: the timer then starts from this page view */
    }
    return Date.now();
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return Math.max(0, now - start);
}

function PlanSkeleton() {
  return (
    <Card className="hidden lg:block" padded>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-text">Your plan will appear here</span>
        <Badge>preview</Badge>
      </div>
      <div aria-hidden="true" className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border p-3">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="mt-3 h-7 w-2/3" />
            </div>
          ))}
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-3/4" />
        <div className="space-y-2 pt-2">
          {[70, 45, 85, 55].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-4" style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function RunProgressPage() {
  useDocumentTitle('Building your plan');
  const { runId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const run = useRunStatus(runId);
  const status = run.data?.status;
  const active = status === 'queued' || status === 'running' || status === 'needs_resolution';
  const elapsed = useElapsed(runId, active);

  useEffect(() => {
    if (status === 'succeeded') {
      const t = setTimeout(() => {
        toast('success', 'Your plan is ready', 'Opening the plan view.');
        navigate(`/runs/${runId}/plan`, { replace: true });
      }, 1000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [status, runId, navigate, toast]);

  if (run.isLoading) {
    return (
      <div role="status" aria-label="Loading run" className="mx-auto max-w-5xl space-y-5">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-[520px] rounded-2xl" />
      </div>
    );
  }
  if (run.isError || !run.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <ErrorState
          title="Could not load this run"
          error={run.error}
          onRetry={() => void run.refetch()}
        />
        <Link to="/" className="inline-block text-sm font-semibold text-accent-700 hover:underline">
          Back to the home page
        </Link>
      </div>
    );
  }

  const data = run.data;
  const byStage = new Map(data.stages.map((s) => [s.stage, s]));
  const finished = data.status === 'succeeded';
  const waiting = data.status === 'needs_resolution';
  const done = data.stages.filter((s) => s.status === 'succeeded' || s.status === 'cached').length;
  const stageError = data.error ? friendlyCode(data.error.code) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Home
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">
            {finished ? 'Your plan is ready' : 'Building your plan'}
          </h1>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-muted tabular-nums">
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Elapsed time</span>
              {formatClock(elapsed)}
            </span>
            <StatusBadge status={data.status} />
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">
          {done} of 8 stages complete. This page refreshes every 2 seconds while the run is active.
          {USE_FIXTURE ? ' Fixture mode: this run is simulated.' : ''}
        </p>
        <div
          role="progressbar"
          aria-label="Stages complete"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={8}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-sand-300"
        >
          <div
            className="h-full rounded-full bg-brand-green-700 transition-all duration-700"
            style={{ width: `${(done / 8) * 100}%` }}
          />
        </div>
      </div>

      {data.status === 'needs_resolution' && data.cycle ? (
        <CycleResolver
          key={data.cycle.edges.map((e) => `${e.from}>${e.to}`).join(',')}
          runId={runId}
          cycle={data.cycle}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        <Card padded={false}>
          <ol aria-label="Pipeline stages" className="px-4 py-3 sm:px-6 sm:py-4">
            {STAGES.map((def, i) => {
              const n = i + 1;
              const entry: Entry = byStage.get(n) ?? { stage: n, name: '', status: 'pending' };
              const isRunning = entry.status === 'running';
              const isWaiting = isRunning && waiting;
              return (
                <li
                  key={n}
                  aria-current={isRunning ? 'step' : undefined}
                  className="relative flex gap-4 py-3"
                >
                  {n < STAGES.length ? (
                    <span
                      aria-hidden="true"
                      className={clsx(
                        'absolute top-12 bottom-[-0.75rem] left-[1.125rem] w-0.5',
                        entry.status === 'succeeded' || entry.status === 'cached'
                          ? 'bg-emerald-600'
                          : 'bg-sand-300',
                      )}
                    />
                  ) : null}
                  <StageIcon status={entry.status} n={n} waiting={isWaiting} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={clsx(
                          'font-semibold',
                          entry.status === 'pending' ? 'text-muted' : 'text-text',
                        )}
                      >
                        {def.label}
                      </span>
                      <Badge
                        className={
                          def.who === 'Code'
                            ? 'bg-sand-100 text-sand-800 ring-sand-400'
                            : 'bg-brand-green-100 text-brand-green-800 ring-brand-green-200'
                        }
                      >
                        {def.who}
                      </Badge>
                    </div>
                    <p
                      className={clsx(
                        'mt-0.5 text-sm',
                        isRunning && !isWaiting ? 'font-medium text-brand-green-800' : 'text-muted',
                      )}
                    >
                      {isWaiting
                        ? 'Waiting for your decision on a dependency loop.'
                        : isRunning
                          ? def.doing
                          : def.text}
                    </p>
                    {isRunning && !isWaiting ? (
                      <Skeleton className="mt-2 h-2 w-full max-w-xs" />
                    ) : null}
                  </div>
                  <dl className="flex shrink-0 flex-col items-end gap-0.5 text-right text-xs">
                    <dt className="sr-only">Status</dt>
                    <dd
                      className={clsx(
                        'font-semibold',
                        entry.status === 'failed' && 'text-red-700',
                        isRunning && !isWaiting && 'text-brand-green-800',
                        isWaiting && 'text-amber-800',
                        (entry.status === 'succeeded' || entry.status === 'cached') &&
                          'text-emerald-700',
                        entry.status === 'pending' && 'text-muted',
                      )}
                    >
                      {isWaiting ? 'Needs you' : STATUS_TEXT[entry.status]}
                    </dd>
                    <dt className="sr-only">Attempts</dt>
                    <dd className="text-muted">
                      {entry.attempts !== undefined &&
                      entry.status !== 'pending' &&
                      entry.status !== 'cached' &&
                      entry.status !== 'running'
                        ? `${entry.attempts} attempt${entry.attempts === 1 ? '' : 's'}`
                        : ' '}
                    </dd>
                    <dt className="sr-only">Time</dt>
                    <dd className="text-muted tabular-nums">
                      {entry.latency_ms !== undefined &&
                      entry.status !== 'pending' &&
                      entry.status !== 'running'
                        ? entry.status === 'cached'
                          ? '0 ms'
                          : formatDuration(entry.latency_ms)
                        : ' '}
                    </dd>
                  </dl>
                </li>
              );
            })}
          </ol>
        </Card>

        <div className="space-y-5">
          <PlanSkeleton />

          {data.status === 'failed' || data.error ? (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
                <div>
                  <div className="font-semibold text-red-900">
                    {data.error
                      ? `Stage ${data.error.stage} failed`
                      : (stageError?.title ?? 'The run failed')}
                  </div>
                  <p className="mt-1 text-sm text-red-900">
                    {stageError?.message ?? 'The run stopped before it finished.'}
                  </p>
                  {data.error?.message ? (
                    <p className="mt-1.5 text-xs text-red-800">Detail: {data.error.message}</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" onClick={() => navigate('/#new')}>
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      Start a new run
                    </Button>
                    <GoldenDemoButton size="sm" />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {data.issues_count.error + data.issues_count.warning > 0 ? (
            <p className="text-sm text-muted">
              Checks so far: {data.issues_count.error} errors, {data.issues_count.warning} warnings
              (listed on the Issues tab of the plan).
            </p>
          ) : null}

          {finished ? (
            <Link to={`/runs/${runId}/plan`} className={buttonClass('primary', 'lg')}>
              View the plan
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
