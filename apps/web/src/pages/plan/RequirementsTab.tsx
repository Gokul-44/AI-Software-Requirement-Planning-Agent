import clsx from 'clsx';
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IdChip,
  LayerBadge,
  PriorityBadge,
  ProgressBar,
} from '../../components/ui';
import { pct } from '../../lib/format';
import { storyHeadline } from '../../lib/planIndex';
import { usePlan } from './context';

type Filter = 'all' | 'gaps';

export function RequirementsTab() {
  const { plan, index, whatIf, selectTask } = usePlan();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const sprintOf = useMemo(
    () => new Map(whatIf.schedule.tasks.map((t) => [t.task_id, t.sprint])),
    [whatIf.schedule],
  );

  const { coverage } = plan;
  const reqs = plan.requirements.filter((r) => {
    if (filter === 'gaps' && r.story_ids.length > 0 && r.task_ids.length > 0) return false;
    const q = query.trim().toLowerCase();
    return q === '' || r.id.toLowerCase().includes(q) || r.text.toLowerCase().includes(q);
  });

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const storyRatio =
    coverage.requirements_total > 0
      ? coverage.requirements_with_story / coverage.requirements_total
      : 1;
  const taskRatio =
    coverage.requirements_total > 0
      ? coverage.requirements_with_task / coverage.requirements_total
      : 1;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-700">Requirements with a story</span>
            <span className="font-semibold tabular-nums">
              {coverage.requirements_with_story} / {coverage.requirements_total} ({pct(storyRatio)})
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar
              value={storyRatio}
              warn={storyRatio < 1}
              label="Requirements with a story"
            />
          </div>
        </Card>
        <Card>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-700">Requirements with a task</span>
            <span className="font-semibold tabular-nums">
              {coverage.requirements_with_task} / {coverage.requirements_total} ({pct(taskRatio)})
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar value={taskRatio} warn={taskRatio < 1} label="Requirements with a task" />
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Search
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Requirement text or ID"
              className="w-64 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal shadow-sm"
            />
          </label>
          <div
            role="group"
            aria-label="Filter requirements"
            className="flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm"
          >
            {(
              [
                ['all', 'All'],
                ['gaps', 'Coverage gaps'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={filter === v}
                onClick={() => setFilter(v)}
                className={clsx(
                  'rounded-md px-3 py-1 text-sm',
                  filter === v
                    ? 'bg-brand-600 font-medium text-white'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setOpen(new Set(reqs.map((r) => r.id)))}>
            Expand all
          </Button>
          <Button size="sm" onClick={() => setOpen(new Set())}>
            Collapse all
          </Button>
        </div>
      </div>

      {reqs.length === 0 ? (
        <EmptyState title={filter === 'gaps' ? 'No coverage gaps' : 'No requirements match'}>
          {filter === 'gaps'
            ? 'Every requirement reaches at least one story and one task.'
            : 'Try a different search.'}
        </EmptyState>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {reqs.map((r) => {
              const expanded = open.has(r.id);
              const noStory = r.story_ids.length === 0;
              const noTask = r.task_ids.length === 0;
              const stories = r.story_ids
                .map((id) => index.stories.get(id))
                .filter((s) => s !== undefined);
              return (
                <li key={r.id}>
                  <div className="flex items-start gap-3 px-5 py-3.5">
                    <button
                      type="button"
                      onClick={() => toggle(r.id)}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${r.id}`}
                      disabled={stories.length === 0}
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <span
                        className={clsx('transition-transform', expanded && 'rotate-90')}
                        aria-hidden="true"
                      >
                        ▸
                      </span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-500">
                          {r.id}
                        </span>
                        <PriorityBadge priority={r.priority} />
                        <Badge className="bg-slate-50 text-slate-600 ring-slate-200">
                          {r.type === 'functional'
                            ? 'functional'
                            : `non-functional${r.category ? ` · ${r.category}` : ''}`}
                        </Badge>
                        {noStory ? (
                          <Badge className="bg-red-50 text-red-700 ring-red-200">No story</Badge>
                        ) : noTask ? (
                          <Badge className="bg-amber-50 text-amber-800 ring-amber-200">
                            No task
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                            Covered · {r.story_ids.length}{' '}
                            {r.story_ids.length === 1 ? 'story' : 'stories'} · {r.task_ids.length}{' '}
                            tasks
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-800">{r.text}</p>
                      {noStory ? (
                        <p className="mt-1 text-xs text-red-600">
                          Nothing in the plan implements this requirement. Add a story for it or
                          drop it deliberately.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {expanded ? (
                    <ul className="border-t border-slate-100 bg-slate-50/60 py-2 pr-5 pl-14">
                      {stories.map((s) => {
                        const tasks = s.task_ids
                          .filter((tid) => index.tasks.get(tid)?.requirement_ids.includes(r.id))
                          .map((tid) => index.tasks.get(tid))
                          .filter((t) => t !== undefined);
                        return (
                          <li key={s.id} className="py-2">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-mono text-xs font-semibold text-slate-500">
                                {s.id}
                              </span>
                              <span className="font-medium text-slate-800">{storyHeadline(s)}</span>
                              <PriorityBadge priority={s.priority} />
                              <span className="text-xs text-slate-400">
                                {index.epics.get(s.epic_id)?.title}
                              </span>
                            </div>
                            {tasks.length === 0 ? (
                              <p className="mt-1 ml-1 text-xs text-amber-700">
                                No task traces from this story to {r.id}.
                              </p>
                            ) : (
                              <ul className="mt-1.5 space-y-1 border-l-2 border-slate-200 pl-4">
                                {tasks.map((t) => (
                                  <li
                                    key={t.id}
                                    className="flex flex-wrap items-center gap-2 text-sm"
                                  >
                                    <IdChip
                                      id={t.id}
                                      critical={index.criticalIds.has(t.id)}
                                      onClick={() => selectTask(t.id)}
                                    />
                                    <span className="text-slate-700">{t.title}</span>
                                    <LayerBadge layer={t.layer} />
                                    <span className="text-xs text-slate-400">
                                      {t.points} pt · sprint {sprintOf.get(t.id) ?? '?'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <p className="text-xs text-slate-400">
        Requirement → story → task links are derived by code from the story-level references and
        checked in both directions.
      </p>
    </div>
  );
}
