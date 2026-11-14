import clsx from 'clsx';
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { USE_FIXTURE } from '../../api/client';
import { errorCode } from '../../api/errors';
import { usePlanData } from '../../api/hooks';
import { ExportButtons } from '../../components/ExportButtons';
import { TaskDetails } from '../../components/TaskDetails';
import { Badge, Button, ErrorState, PageLoading } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { PLAN_TABS } from '../../lib/tabs';
import { PlanProvider } from './PlanProvider';
import { usePlan } from './context';

export function PlanPage() {
  const { runId = '' } = useParams();
  const query = usePlanData(runId);

  if (query.isLoading) return <PageLoading label="Loading plan" />;
  if (query.isError || !query.data) {
    const notReady = errorCode(query.error) === 'RUN_NOT_READY';
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <ErrorState
          title={notReady ? 'This run has not finished yet' : 'Could not load the plan'}
          error={query.error}
          onRetry={notReady ? undefined : () => void query.refetch()}
        />
        <div className="flex gap-3 text-sm">
          {notReady ? (
            <Link className="font-medium text-brand-600 underline" to={`/runs/${runId}`}>
              See run progress
            </Link>
          ) : null}
          <Link className="text-slate-600 underline" to="/">
            Back to the home page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PlanProvider plan={query.data}>
      <PlanFrame />
    </PlanProvider>
  );
}

function PlanFrame() {
  const { plan, selectedTaskId, selectTask } = usePlan();
  const location = useLocation();
  const onGraph = location.pathname.endsWith('/graph');
  const drawerOpen = selectedTaskId !== null;
  // On the graph tab, wide screens dock the details panel beside the graph instead.
  const hideOnWide = onGraph ? 'lg:hidden' : '';

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectTask(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, selectTask]);

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
              ← Home
            </Link>
            <h1 className="mt-1 line-clamp-2 text-xl font-semibold text-slate-900 sm:text-2xl">
              {plan.project.idea_text}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge
                className={
                  plan.run.status === 'succeeded'
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : 'bg-amber-50 text-amber-800 ring-amber-200'
                }
              >
                {plan.run.status}
              </Badge>
              <span>
                {plan.run.llm.provider} · {plan.run.llm.model}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatDate(plan.run.created_at)}</span>
              {USE_FIXTURE ? (
                <Badge
                  className="bg-amber-50 text-amber-800 ring-amber-200"
                  title="Sample data from /golden/*.json"
                >
                  sample plan
                </Badge>
              ) : null}
            </div>
          </div>
          <ExportButtons plan={plan} />
        </div>

        <nav aria-label="Plan sections" className="-mx-1 overflow-x-auto">
          <ul className="flex min-w-max gap-1 border-b border-slate-200 px-1">
            {PLAN_TABS.map((t) => (
              <li key={t.path}>
                <NavLink
                  to={{ pathname: t.path, search: selectedTaskId ? `?task=${selectedTaskId}` : '' }}
                  className={({ isActive }) =>
                    clsx(
                      '-mb-px block border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-brand-600 text-brand-700'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
                    )
                  }
                >
                  {t.label}
                  <TabCount path={t.path} />
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <Outlet />

      {drawerOpen && selectedTaskId ? (
        <>
          <div
            className={clsx('fixed inset-0 z-40 bg-slate-900/20', hideOnWide)}
            onClick={() => selectTask(null)}
            aria-hidden="true"
          />
          <aside
            aria-label="Task details"
            className={clsx(
              'spm-slide-in fixed top-0 right-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl',
              hideOnWide,
            )}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <span className="text-sm font-semibold text-slate-700">Task details</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => selectTask(null)}
                aria-label="Close task details"
              >
                Close ✕
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <TaskDetails taskId={selectedTaskId} />
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}

function TabCount({ path }: { path: string }) {
  const { plan } = usePlan();
  const counts: Record<string, number | undefined> = {
    requirements: plan.requirements.length,
    stories: plan.stories.length,
    tasks: plan.tasks.length,
    sprints: plan.schedule.sprints.length,
    risks: plan.risks.length,
    issues: plan.issues.length,
  };
  const n = counts[path];
  if (n === undefined) return null;
  return (
    <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 tabular-nums">
      {n}
    </span>
  );
}
