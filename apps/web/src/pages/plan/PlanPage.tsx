import clsx from 'clsx';
import { useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { USE_FIXTURE } from '../../api/client';
import { errorCode } from '../../api/errors';
import { usePlanData } from '../../api/hooks';
import { ExportButtons } from '../../components/ExportButtons';
import { TaskDetails } from '../../components/TaskDetails';
import { StatusBadge } from '../../components/StatusBadge';
import { Badge, Button, ErrorState, PageLoading } from '../../components/ui';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
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
            <Link className="font-semibold text-accent-700 underline" to={`/runs/${runId}`}>
              See run progress
            </Link>
          ) : null}
          <Link className="text-brand-green-800 underline" to="/">
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

  useDocumentTitle(plan.project.idea_text.slice(0, 60));

  return (
    <div className="space-y-6">
      <header className="sticky top-[4.5rem] z-30 rounded-2xl border border-border bg-surface/95 shadow-card backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                to="/"
                aria-label="Back to the home page"
                className="shrink-0 rounded-full p-1 text-muted hover:bg-sand-200 hover:text-text"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
              <h1
                title={plan.project.idea_text}
                className="truncate text-base font-semibold text-text sm:text-lg"
              >
                {plan.project.idea_text}
              </h1>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 pl-8 text-xs text-muted">
              <StatusBadge status={plan.run.status} />
              {USE_FIXTURE ? (
                <Badge
                  className="bg-amber-50 text-amber-900 ring-amber-200"
                  title="Sample data from /golden/*.json"
                >
                  sample plan
                </Badge>
              ) : null}
              <span className="hidden sm:inline">
                {plan.run.llm.provider} · {plan.run.llm.model} · {formatDate(plan.run.created_at)}
              </span>
            </div>
          </div>
          <ExportButtons plan={plan} />
        </div>

        <nav
          aria-label="Plan sections"
          className="mt-1 overflow-x-auto px-2 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden"
        >
          <ul className="flex min-w-max gap-1">
            {PLAN_TABS.map((t) => (
              <li key={t.path}>
                <NavLink
                  to={{ pathname: t.path, search: selectedTaskId ? `?task=${selectedTaskId}` : '' }}
                  className={({ isActive }) =>
                    clsx(
                      'block border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-accent-600 text-accent-700'
                        : 'border-transparent text-muted hover:border-sand-500 hover:text-text',
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

      <div key={location.pathname} className="spm-fade-in">
        <Outlet />
      </div>

      {drawerOpen && selectedTaskId ? (
        <>
          <div
            className={clsx('fixed inset-0 z-40 bg-brand-green-950/40', hideOnWide)}
            onClick={() => selectTask(null)}
            aria-hidden="true"
          />
          <aside
            aria-label="Task details"
            className={clsx(
              'spm-slide-in fixed top-0 right-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-lift',
              hideOnWide,
            )}
          >
            <div className="flex items-center justify-between border-b border-sand-200 px-5 py-3">
              <span className="text-sm font-semibold text-brand-green-800">Task details</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => selectTask(null)}
                aria-label="Close task details"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Close
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
    <span className="ml-1.5 rounded-full bg-sand-200 px-1.5 py-0.5 text-[11px] font-semibold text-brand-green-800 tabular-nums">
      {n}
    </span>
  );
}
