import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { USE_FIXTURE } from '../api/client';
import { useRunStatus } from '../api/hooks';
import type { RunStatus } from '../api/types';
import { Badge, Button, Card, ErrorState, PageLoading } from '../components/ui';
import { formatDuration } from '../lib/format';

const STAGES: { label: string; who: 'AI' | 'Code' | 'AI + code'; text: string }[] = [
  {
    label: 'Requirement analysis',
    who: 'AI',
    text: 'Turns the idea into functional and non-functional requirements and lists assumptions.',
  },
  {
    label: 'Epics and stories',
    who: 'AI',
    text: 'Groups requirements into epics and user stories with acceptance criteria.',
  },
  {
    label: 'Task decomposition',
    who: 'AI',
    text: 'Splits every story into developer tasks, one call per epic.',
  },
  {
    label: 'Effort estimation',
    who: 'AI',
    text: 'Assigns story points; code converts them to hours.',
  },
  {
    label: 'Dependencies',
    who: 'AI + code',
    text: 'The model proposes edges; code rejects bad references and checks for cycles.',
  },
  {
    label: 'Scheduling',
    who: 'Code',
    text: 'Critical path (CPM), priority order and capacity-feasible sprint packing.',
  },
  {
    label: 'Risks',
    who: 'AI + code',
    text: 'Code computes risk signals; the model explains them; code checks every citation.',
  },
  {
    label: 'Assemble and export',
    who: 'Code',
    text: 'Builds and validates plan.json for the UI and the exports.',
  },
];

type Entry = RunStatus['stages'][number];
const STATUS_TEXT: Record<Entry['status'], string> = {
  pending: 'Waiting',
  running: 'Running',
  succeeded: 'Done',
  cached: 'Cached',
  failed: 'Failed',
};

function StageIcon({ status, n }: { status: Entry['status']; n: number }) {
  const base =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold';
  if (status === 'succeeded')
    return <span className={clsx(base, 'bg-emerald-500 text-white')}>✓</span>;
  if (status === 'cached') return <span className={clsx(base, 'bg-sky-500 text-white')}>✓</span>;
  if (status === 'failed') return <span className={clsx(base, 'bg-red-500 text-white')}>!</span>;
  if (status === 'running')
    return (
      <span className={clsx(base, 'spm-pulse bg-brand-600 text-white ring-4 ring-brand-100')}>
        {n}
      </span>
    );
  return <span className={clsx(base, 'bg-slate-100 text-slate-400')}>{n}</span>;
}

function statusBadgeClass(status: RunStatus['status']): string {
  switch (status) {
    case 'succeeded':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'failed':
      return 'bg-red-50 text-red-700 ring-red-200';
    case 'needs_resolution':
      return 'bg-amber-50 text-amber-800 ring-amber-200';
    default:
      return 'bg-brand-50 text-brand-700 ring-brand-200';
  }
}

export function RunProgressPage() {
  const { runId = '' } = useParams();
  const navigate = useNavigate();
  const run = useRunStatus(runId);
  const sawRunning = useRef(false);
  const status = run.data?.status;

  useEffect(() => {
    if (status === 'running' || status === 'queued') sawRunning.current = true;
    if (status === 'succeeded' && sawRunning.current) {
      const t = setTimeout(() => navigate(`/runs/${runId}/plan`, { replace: true }), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [status, runId, navigate]);

  if (run.isLoading) return <PageLoading label="Loading run" />;
  if (run.isError || !run.data) {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState
          title="Could not load this run"
          error={run.error}
          onRetry={() => void run.refetch()}
        />
        <Link to="/" className="mt-4 inline-block text-sm text-brand-600 underline">
          Back to the home page
        </Link>
      </div>
    );
  }

  const data = run.data;
  const byStage = new Map(data.stages.map((s) => [s.stage, s]));
  const finished = data.status === 'succeeded';
  const done = data.stages.filter((s) => s.status === 'succeeded' || s.status === 'cached').length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Home
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">Building your plan</h1>
          <Badge className={statusBadgeClass(data.status)}>{data.status.replace('_', ' ')}</Badge>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {done} of 8 stages complete · refreshed every 2 seconds while the run is active.
          {USE_FIXTURE ? ' Fixture mode: this run is simulated.' : ''}
        </p>
      </div>

      <Card padded={false}>
        <ol className="divide-y divide-slate-100">
          {STAGES.map((def, i) => {
            const n = i + 1;
            const entry: Entry = byStage.get(n) ?? { stage: n, name: '', status: 'pending' };
            return (
              <li
                key={n}
                aria-current={entry.status === 'running' ? 'step' : undefined}
                className={clsx(
                  'flex items-start gap-4 px-5 py-4',
                  entry.status === 'running' && 'bg-brand-50/50',
                )}
              >
                <StageIcon status={entry.status} n={n} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{def.label}</span>
                    <Badge
                      className={
                        def.who === 'Code'
                          ? 'bg-slate-100 text-slate-600 ring-slate-200'
                          : 'bg-violet-50 text-violet-700 ring-violet-200'
                      }
                    >
                      {def.who}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{def.text}</p>
                </div>
                <dl className="flex shrink-0 flex-col items-end gap-0.5 text-right text-xs">
                  <dt className="sr-only">Status</dt>
                  <dd
                    className={clsx(
                      'font-medium',
                      entry.status === 'failed' && 'text-red-600',
                      entry.status === 'running' && 'text-brand-600',
                      (entry.status === 'succeeded' || entry.status === 'cached') &&
                        'text-emerald-700',
                      entry.status === 'pending' && 'text-slate-400',
                    )}
                  >
                    {STATUS_TEXT[entry.status]}
                  </dd>
                  <dt className="sr-only">Attempts</dt>
                  <dd className="text-slate-500">
                    {entry.attempts !== undefined && entry.status !== 'pending'
                      ? entry.status === 'cached'
                        ? 'reused'
                        : `${entry.attempts} attempt${entry.attempts === 1 ? '' : 's'}`
                      : ' '}
                  </dd>
                  <dt className="sr-only">Time</dt>
                  <dd className="text-slate-500 tabular-nums">
                    {entry.latency_ms !== undefined &&
                    entry.status !== 'pending' &&
                    entry.status !== 'running'
                      ? entry.status === 'cached'
                        ? '0 ms'
                        : formatDuration(entry.latency_ms)
                      : ' '}
                  </dd>
                </dl>
              </li>
            );
          })}
        </ol>
      </Card>

      {data.error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="font-semibold text-red-800">Stage {data.error.stage} failed</div>
          <p className="mt-1 text-sm text-red-700">{data.error.message}</p>
          <p className="mt-1 font-mono text-xs text-red-500">{data.error.code}</p>
        </div>
      ) : null}

      {data.status === 'needs_resolution' && data.cycle ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="font-semibold text-amber-900">The dependency graph has a cycle</div>
          <p className="mt-1 text-sm text-amber-800">
            Tasks {data.cycle.task_ids.join(', ')} depend on each other in a loop, so no order
            exists. Remove one of these edges to continue:
          </p>
          <ul className="mt-2 space-y-0.5 font-mono text-xs text-amber-900">
            {data.cycle.edges.map((e) => (
              <li key={`${e.from}-${e.to}`}>
                {e.from} → {e.to}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.issues_count.error + data.issues_count.warning > 0 ? (
        <p className="text-sm text-slate-500">
          Checks so far: {data.issues_count.error} errors, {data.issues_count.warning} warnings
          (shown on the Issues tab of the plan).
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {finished ? (
          <Button variant="primary" onClick={() => navigate(`/runs/${runId}/plan`)}>
            View the plan
          </Button>
        ) : null}
        {data.status === 'failed' ? (
          <Button variant="secondary" onClick={() => navigate('/')}>
            Start over
          </Button>
        ) : null}
      </div>
    </div>
  );
}
