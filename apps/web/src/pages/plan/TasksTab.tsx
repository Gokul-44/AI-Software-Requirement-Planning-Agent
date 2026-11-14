import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Button, Card, CriticalBadge, EmptyState, LayerBadge, Select } from '../../components/ui';
import { NO_FILTERS, buildTaskRows, filterTasks, sortTasks } from '../../lib/tasks';
import type { SortDir, SortKey, TaskFilters } from '../../lib/tasks';
import { usePlan } from './context';

const COLUMNS: { key: SortKey; label: string; align?: 'right'; title?: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Task' },
  { key: 'epicTitle', label: 'Epic' },
  { key: 'layer', label: 'Layer' },
  { key: 'points', label: 'Pts', align: 'right' },
  { key: 'hours', label: 'Hours', align: 'right' },
  { key: 'sprint', label: 'Sprint', align: 'right' },
  {
    key: 'slack',
    label: 'Slack (h)',
    align: 'right',
    title: 'CPM slack: hours a task can slip without moving the finish date',
  },
  { key: 'critical', label: 'Critical' },
];

export function TasksTab() {
  const { plan, index, whatIf, selectTask, selectedTaskId } = usePlan();
  const [filters, setFilters] = useState<TaskFilters>(NO_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'id', dir: 'asc' });

  const rows = useMemo(() => buildTaskRows(plan, whatIf.schedule), [plan, whatIf.schedule]);
  const visible = useMemo(
    () => sortTasks(filterTasks(rows, filters), sort.key, sort.dir),
    [rows, filters, sort],
  );
  const layers = useMemo(() => [...new Set(plan.tasks.map((t) => t.layer))].sort(), [plan.tasks]);
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const totals = visible.reduce(
    (acc, r) => ({ points: acc.points + r.points, hours: acc.hours + r.hours }),
    { points: 0, hours: 0 },
  );

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Search
          <input
            type="search"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            placeholder="Task title or ID"
            className="w-56 rounded-lg border border-sand-400 bg-surface px-2.5 py-1.5 text-sm font-normal shadow-sm"
          />
        </label>
        <Select
          label="Epic"
          value={filters.epic}
          onChange={(epic) => setFilters({ ...filters, epic })}
          className="w-60"
        >
          <option value="">All epics</option>
          {plan.epics.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </Select>
        <Select
          label="Layer"
          value={filters.layer}
          onChange={(layer) => setFilters({ ...filters, layer })}
          className="w-40"
        >
          <option value="">All layers</option>
          {layers.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 pb-2 text-sm text-brand-green-800">
          <input
            type="checkbox"
            checked={filters.criticalOnly}
            onChange={(e) => setFilters({ ...filters, criticalOnly: e.target.checked })}
            className="h-4 w-4 rounded border-sand-400 accent-accent-600"
          />
          Critical only
        </label>
        {filtered ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFilters(NO_FILTERS)}
            className="mb-1.5"
          >
            Clear filters
          </Button>
        ) : null}
        <span className="ml-auto pb-2 text-sm text-muted">
          {visible.length} of {rows.length} tasks · {totals.points} pts · {totals.hours} h
        </span>
      </div>

      {whatIf.isScenario ? (
        <p className="rounded-lg bg-accent-50 px-3 py-2 text-xs text-accent-700">
          The Sprint column shows your what-if scenario ({whatIf.settings.team_size} devs,{' '}
          {whatIf.settings.velocity_points_per_person} pts each, {whatIf.settings.pack_mode}{' '}
          packing), not the saved plan.
        </p>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState title="No tasks match these filters">
          <Button size="sm" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </Button>
        </EmptyState>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border bg-sand-100 text-xs tracking-wide text-muted uppercase">
                <tr>
                  {COLUMNS.map((c) => {
                    const active = sort.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={
                          active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                        }
                        className={clsx(
                          'px-3 py-2.5 font-semibold',
                          c.align === 'right' && 'text-right',
                        )}
                        title={c.title}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className={clsx(
                            'inline-flex items-center gap-1 uppercase hover:text-text',
                            active && 'text-text',
                          )}
                        >
                          {c.label}
                          <span
                            aria-hidden="true"
                            className={clsx('text-[10px]', !active && 'opacity-30')}
                          >
                            {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▲'}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-200">
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => selectTask(r.id)}
                    className={clsx(
                      'cursor-pointer hover:bg-sand-100',
                      selectedTaskId === r.id && 'bg-accent-50/70',
                    )}
                  >
                    <td className="px-3 py-2.5 font-mono text-xs font-medium whitespace-nowrap text-muted">
                      <button
                        type="button"
                        onClick={() => selectTask(r.id)}
                        className="hover:text-accent-700 hover:underline"
                      >
                        {r.id}
                      </button>
                    </td>
                    <td className="max-w-md px-3 py-2.5 text-text">{r.title}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                      <span
                        className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                        style={{ background: index.colorOfEpic(r.epicId) }}
                      />
                      {r.epicTitle}
                    </td>
                    <td className="px-3 py-2.5">
                      <LayerBadge layer={r.layer} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.points}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.hours}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.sprint}</td>
                    <td
                      className={clsx(
                        'px-3 py-2.5 text-right tabular-nums',
                        r.slack === 0 ? 'font-semibold text-accent-700' : 'text-muted',
                      )}
                    >
                      {r.slack}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.critical ? <CriticalBadge /> : <span className="text-sand-600">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
