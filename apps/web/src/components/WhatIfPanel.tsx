import clsx from 'clsx';
import { useId } from 'react';
import { formatDays, plural } from '../lib/format';
import { usePlan } from '../pages/plan/context';
import { Badge, Button, Card } from './ui';

function Slider({
  label,
  value,
  min,
  max,
  base,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  base: number;
  onChange: (v: number) => void;
  unit: string;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        <span className="text-sm font-semibold text-slate-900 tabular-nums">
          {value}
          <span className="ml-1 text-xs font-normal text-slate-500">{unit}</span>
          {value !== base ? (
            <span className="ml-2 text-xs font-normal text-slate-400">(plan: {base})</span>
          ) : null}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-brand-600"
      />
    </div>
  );
}

function Delta({ before, after, unit }: { before: number; after: number; unit: string }) {
  const diff = after - before;
  if (diff === 0) return <span className="text-xs text-slate-500">no change</span>;
  return (
    <span className={clsx('text-xs font-semibold', diff < 0 ? 'text-emerald-700' : 'text-red-600')}>
      {diff > 0 ? '+' : ''}
      {formatDays(diff)} {Math.abs(diff) === 1 ? unit : `${unit}s`}
    </span>
  );
}

/**
 * Client-side what-if (MASTER_PLAN B6 row 7): the same pure scheduler that runs on the server
 * re-packs the sprints in the browser every time a slider moves.
 */
export function WhatIfPanel() {
  const { plan, whatIf } = usePlan();
  const { settings, baseline, setSettings, reset, active, result } = whatIf;
  const before = plan.schedule.capacity_plan;
  const after = result.ok ? result.schedule.capacity_plan : null;
  const cpmDays = plan.schedule.cpm.duration_days;

  return (
    <Card className="border-brand-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            What-if
            {active ? (
              <Badge className="bg-brand-600 text-white ring-brand-600">scenario active</Badge>
            ) : null}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Change the team and the schedule is recomputed in your browser with the same code the
            server uses. Nothing is saved.
          </p>
        </div>
        <Button size="sm" variant="ghost" disabled={!active} onClick={reset}>
          Reset to plan
        </Button>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1fr_auto_minmax(280px,1fr)] lg:items-start">
        <Slider
          label="Team size"
          unit="devs"
          min={1}
          max={12}
          value={settings.team_size}
          base={baseline.team_size}
          onChange={(v) => setSettings({ ...settings, team_size: v })}
        />
        <Slider
          label="Velocity per person"
          unit="pts / sprint"
          min={1}
          max={20}
          value={settings.velocity_points_per_person}
          base={baseline.velocity_points_per_person}
          onChange={(v) => setSettings({ ...settings, velocity_points_per_person: v })}
        />
        <div>
          <div className="text-sm font-medium text-slate-700">Pack mode</div>
          <div
            role="group"
            aria-label="Pack mode"
            className="mt-1.5 flex w-fit rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm"
          >
            {(['relaxed', 'strict'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={settings.pack_mode === m}
                aria-label={`${m} packing`}
                onClick={() => setSettings({ ...settings, pack_mode: m })}
                title={
                  m === 'relaxed'
                    ? 'A task and its dependency may share a sprint, bounded by sprint hours.'
                    : 'A task starts only in a sprint after all its dependencies finish.'
                }
                className={clsx(
                  'rounded-md px-3 py-1 text-sm capitalize',
                  settings.pack_mode === m
                    ? 'bg-brand-600 font-medium text-white'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div aria-live="polite" className="rounded-lg bg-slate-50 p-3">
          {after ? (
            <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
              <span />
              <span className="text-xs font-medium text-slate-500 uppercase">Before</span>
              <span className="text-xs font-medium text-slate-500 uppercase">After</span>

              <span className="text-slate-600">Sprints</span>
              <span className="font-semibold tabular-nums">{before.sprint_count}</span>
              <span className="flex items-baseline gap-2 font-semibold tabular-nums">
                <span
                  className={clsx(
                    'text-lg',
                    after.sprint_count < before.sprint_count && 'text-emerald-700',
                    after.sprint_count > before.sprint_count && 'text-red-600',
                  )}
                >
                  {after.sprint_count}
                </span>
                <Delta before={before.sprint_count} after={after.sprint_count} unit="sprint" />
              </span>

              <span className="text-slate-600">Working days</span>
              <span className="tabular-nums">{formatDays(before.duration_days)}</span>
              <span className="tabular-nums">{formatDays(after.duration_days)}</span>

              <span className="text-slate-600">Points / sprint</span>
              <span className="tabular-nums">{before.capacity_points_per_sprint}</span>
              <span className="tabular-nums">{after.capacity_points_per_sprint}</span>
            </div>
          ) : (
            <div role="alert" className="text-sm text-red-700">
              <div className="font-semibold">Not applied</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                {!result.ok ? result.reasons.map((r) => <li key={r}>{r}</li>) : null}
              </ul>
              <p className="mt-1 text-xs text-slate-500">The tabs still show the saved plan.</p>
            </div>
          )}
        </div>
      </div>

      {after && after.duration_days <= cpmDays + plan.run.config.sprint_length_days ? (
        <p className="mt-3 text-xs text-slate-500">
          The plan is already within one sprint of the CPM minimum ({formatDays(cpmDays)} days):
          more people cannot beat the dependency chain, because CPM does not depend on team size.
        </p>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          CPM stays at {formatDays(cpmDays)} days whatever the team (
          {plural(plan.schedule.cpm.critical_path.length, 'task')} on the critical chain); only the
          capacity-feasible plan moves.
        </p>
      )}
    </Card>
  );
}
