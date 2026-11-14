import { ArrowRight, History as HistoryIcon, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProjects } from '../api/hooks';
import { StatusBadge } from '../components/StatusBadge';
import { Card, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { buttonClass } from '../lib/buttonClass';
import { formatDate } from '../lib/format';
import { useDocumentTitle } from '../lib/useDocumentTitle';

/** Project history: GET /api/projects (the 20 most recent). */
export function HistoryPage() {
  useDocumentTitle('History');
  const projects = useProjects();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text sm:text-3xl">History</h1>
          <p className="mt-1 text-sm text-muted">
            Your most recent projects, newest first. Open one to see its plan or its progress.
          </p>
        </div>
        <Link to="/#new" className={buttonClass('primary', 'md')}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New plan
        </Link>
      </div>

      {projects.isLoading ? (
        <div role="status" aria-label="Loading history" className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : projects.isError ? (
        <ErrorState
          title="Could not load your history"
          error={projects.error}
          onRetry={() => void projects.refetch()}
        />
      ) : (projects.data ?? []).length === 0 ? (
        <EmptyState
          title="No plans yet"
          icon={<HistoryIcon className="h-6 w-6" aria-hidden="true" />}
          action={
            <Link to="/#new" className={buttonClass('primary', 'md')}>
              Create your first plan
            </Link>
          }
        >
          Plans you generate will be listed here. Until then, you can open a sample plan from the
          home page.
        </EmptyState>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-sand-200">
            {projects.data?.map((p) => {
              const run = p.latest_run;
              const to = !run
                ? '/'
                : run.status === 'succeeded'
                  ? `/runs/${run.id}/plan`
                  : `/runs/${run.id}`;
              return (
                <li key={p.id}>
                  <Link
                    to={to}
                    className="group flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-sand-100 sm:px-6"
                  >
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-sm font-semibold text-text">
                        {p.idea_text}
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {formatDate(p.created_at)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <StatusBadge status={run?.status ?? null} />
                      <ArrowRight
                        className="hidden h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 sm:block"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
