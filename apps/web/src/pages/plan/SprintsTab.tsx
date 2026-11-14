import { WhatIfPanel } from '../../components/WhatIfPanel';
import { Badge, CriticalBadge, EmptyState, LayerBadge, ProgressBar } from '../../components/ui';
import { pct } from '../../lib/format';
import { usePlan } from './context';

/** Red at 90% utilisation or more (same threshold as the sprint_overload signal). */
const OVERLOAD = 0.9;

export function SprintsTab() {
  const { plan, index, whatIf, selectTask, selectedTaskId } = usePlan();
  const schedule = whatIf.schedule;
  const hoursPerSprint = schedule.capacity_plan.hours_per_sprint;
  const bySchedule = new Map(schedule.tasks.map((t) => [t.task_id, t]));

  return (
    <div className="space-y-5">
      <WhatIfPanel />

      {whatIf.isScenario ? (
        <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
          Showing what-if scenario: {whatIf.settings.team_size} devs,{' '}
          {whatIf.settings.velocity_points_per_person} pts each, {whatIf.settings.pack_mode} packing
        </Badge>
      ) : null}

      {schedule.sprints.length === 0 ? (
        <EmptyState title="No sprints">This plan has no tasks to schedule.</EmptyState>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-3">
          {schedule.sprints.map((s) => {
            const tasks = s.task_ids
              .map((id) => index.tasks.get(id))
              .filter((t) => t !== undefined);
            const hours = tasks.reduce((n, t) => n + t.hours, 0);
            const over = s.utilisation >= OVERLOAD;
            return (
              <section
                key={s.number}
                aria-label={`Sprint ${s.number}`}
                className="flex min-w-[280px] flex-1 flex-col rounded-xl border border-slate-200 bg-slate-50 shadow-sm"
              >
                <div className="space-y-2 rounded-t-xl border-b border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">Sprint {s.number}</h2>
                    <span className="text-xs text-slate-500">{tasks.length} tasks</span>
                  </div>
                  <ProgressBar
                    value={s.utilisation}
                    danger={over}
                    label={`Sprint ${s.number} utilisation`}
                  />
                  <div className="flex items-baseline justify-between text-xs">
                    <span
                      className={over ? 'font-semibold text-red-600' : 'font-medium text-slate-700'}
                    >
                      {s.load_points} / {s.capacity_points} pts · {pct(s.utilisation)}
                    </span>
                    <span className="text-slate-400">
                      {hours} / {hoursPerSprint} h
                    </span>
                  </div>
                  {over ? (
                    <p className="text-xs text-red-600">
                      At or above 90%: any slip spills into the next sprint.
                    </p>
                  ) : null}
                </div>
                <ul className="flex-1 space-y-2 p-3">
                  {tasks.map((t) => {
                    const critical = bySchedule.get(t.id)?.critical ?? false;
                    const color = index.colorOfTask(t.id);
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => selectTask(t.id)}
                          className={
                            'w-full rounded-lg border border-l-4 bg-white p-2.5 text-left text-sm shadow-sm transition hover:shadow-md ' +
                            (selectedTaskId === t.id
                              ? 'border-brand-500 ring-1 ring-brand-500'
                              : 'border-slate-200')
                          }
                          style={{ borderLeftColor: critical ? '#dc2626' : color }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-500">
                              {t.id}
                            </span>
                            <span className="text-xs font-semibold text-slate-700 tabular-nums">
                              {t.points} pt
                            </span>
                          </div>
                          <div className="mt-0.5 leading-snug text-slate-800">{t.title}</div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <LayerBadge layer={t.layer} />
                            {critical ? <CriticalBadge /> : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <p className="text-xs text-slate-400">
        Capacity per sprint = team size × velocity ={' '}
        {schedule.capacity_plan.capacity_points_per_sprint} points. The last sprint is usually only
        partly full, so it is not a sign of imbalance. Left border: red for critical tasks,
        otherwise the epic colour.
        {` Plan saved with ${plan.run.config.team_size} devs.`}
      </p>
    </div>
  );
}
