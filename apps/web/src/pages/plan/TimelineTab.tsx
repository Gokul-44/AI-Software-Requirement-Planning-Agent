import clsx from 'clsx';
import { useState } from 'react';
import { Gantt } from '../../components/Gantt';
import { WhatIfPanel } from '../../components/WhatIfPanel';
import { Badge, Card, Legend } from '../../components/ui';
import { CRITICAL_COLOR } from '../../lib/colors';
import { capacityRatio, formatDays, plural } from '../../lib/format';
import type { GanttMode } from '../../lib/gantt';
import { usePlan } from './context';

const MODES: { id: GanttMode; label: string }[] = [
  { id: 'sprint', label: 'Sprint plan (capacity)' },
  { id: 'cpm', label: 'CPM (unlimited people)' },
];

export function TimelineTab() {
  const { plan, index, whatIf } = usePlan();
  const [mode, setMode] = useState<GanttMode>('sprint');
  const schedule = whatIf.schedule;
  const team = whatIf.result.ok ? whatIf.result.config.team_size : plan.run.config.team_size;
  const cpmDays = plan.schedule.cpm.duration_days;
  const planDays = schedule.capacity_plan.duration_days;
  const ratio = capacityRatio(planDays, cpmDays);

  return (
    <div className="space-y-5">
      <WhatIfPanel />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Timeline view"
          className="flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm"
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
              className={clsx(
                'rounded-md px-4 py-1.5 text-sm',
                mode === m.id
                  ? 'bg-brand-600 font-medium text-white'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {whatIf.isScenario ? (
          <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
            Showing what-if scenario: {plural(team, 'dev')}
          </Badge>
        ) : null}
      </div>

      <Card
        className={
          mode === 'sprint'
            ? 'border-brand-200 bg-brand-50/40'
            : 'border-violet-200 bg-violet-50/40'
        }
      >
        {mode === 'sprint' ? (
          <>
            <div className="text-sm font-semibold text-slate-900">
              Sprint plan: what a team of {plural(team, 'developer')} can actually deliver
            </div>
            <p className="mt-1 text-sm text-slate-700">
              Tasks are packed into sprints by priority within the capacity of{' '}
              {schedule.capacity_plan.capacity_points_per_sprint} points and{' '}
              {schedule.capacity_plan.hours_per_sprint} focus hours per sprint, so this plan takes{' '}
              <strong>
                {plural(schedule.capacity_plan.sprint_count, 'sprint')} (about{' '}
                {formatDays(planDays)} working days)
              </strong>
              . The purple dashed line marks the CPM minimum of {formatDays(cpmDays)} days, which is
              the earliest finish if everyone could work in parallel.
            </p>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold text-slate-900">
              CPM: the dependency-limited lower bound, with unlimited people
            </div>
            <p className="mt-1 text-sm text-slate-700">
              Every task starts as soon as its dependencies finish, no matter how many people that
              needs at once. The project cannot be shorter than{' '}
              <strong>{formatDays(cpmDays)} working days</strong>. Faded bars show slack: how far a
              task can slip without delaying the end. The dashed line marks where the
              capacity-feasible plan really ends ({formatDays(planDays)} days
              {ratio !== null ? `, ${ratio.toFixed(1)}× longer` : ''}). Sprint bands are shown for
              reference only.
            </p>
          </>
        )}
      </Card>

      <Legend
        items={[
          { color: CRITICAL_COLOR, label: 'Critical path (zero slack, same colour in both views)' },
          ...plan.epics.map((e) => ({ color: index.colorOfEpic(e.id), label: e.title })),
        ]}
      />

      <Gantt schedule={schedule} mode={mode} />

      <p className="text-xs text-slate-400">
        Times are working hours from the project start, shown as working days of{' '}
        {plan.run.config.focus_hours_per_day} focus hours. Bars inside a sprint show relative order
        only: no individual developer is assigned.
      </p>
    </div>
  );
}
