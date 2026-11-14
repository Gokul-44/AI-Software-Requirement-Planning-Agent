import clsx from 'clsx';
import type { ConfigFormResult, ConfigFormValues } from '../lib/configForm';
import { POINT_KEYS, defaultFormValues } from '../lib/configForm';
import { Button } from './ui';

function NumberField({
  id,
  label,
  hint,
  value,
  error,
  onChange,
  step,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  error?: string | undefined;
  onChange: (v: string) => void;
  step?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step ?? 1}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          'mt-1 w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm tabular-nums shadow-sm',
          error ? 'border-red-400 ring-1 ring-red-200' : 'border-slate-300',
        )}
      />
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

function Invariant({ ok, children }: { ok: boolean | null; children: string }) {
  return (
    <li
      className={clsx(
        'flex items-center gap-1.5 text-xs',
        ok === null ? 'text-slate-400' : ok ? 'text-emerald-700' : 'font-medium text-red-600',
      )}
    >
      <span aria-hidden="true">{ok === null ? '·' : ok ? '✓' : '✗'}</span>
      {children}
    </li>
  );
}

/** Config form with defaults (C6) and live invariant validation (D-08). */
export function ConfigForm({
  values,
  result,
  onChange,
}: {
  values: ConfigFormValues;
  result: ConfigFormResult;
  onChange: (next: ConfigFormValues) => void;
}) {
  const { errors, derived, invariants } = result;
  const set = <K extends keyof ConfigFormValues>(key: K, v: ConfigFormValues[K]) =>
    onChange({ ...values, [key]: v });
  const isDefault = JSON.stringify(values) === JSON.stringify(defaultFormValues());

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <NumberField
          id="cfg-team"
          label="Team size"
          hint="developers"
          value={values.team_size}
          error={errors.team_size}
          onChange={(v) => set('team_size', v)}
        />
        <NumberField
          id="cfg-velocity"
          label="Velocity per person"
          hint="story points per sprint"
          value={values.velocity_points_per_person}
          error={errors.velocity_points_per_person}
          onChange={(v) => set('velocity_points_per_person', v)}
        />
        <NumberField
          id="cfg-sprint"
          label="Sprint length"
          hint="working days"
          value={values.sprint_length_days}
          error={errors.sprint_length_days}
          onChange={(v) => set('sprint_length_days', v)}
        />
        <NumberField
          id="cfg-focus"
          label="Focus hours per day"
          hint="after meetings and overhead"
          step={0.5}
          value={values.focus_hours_per_day}
          error={errors.focus_hours_per_day}
          onChange={(v) => set('focus_hours_per_day', v)}
        />
      </div>

      <div>
        <div className="text-xs font-medium text-slate-700">Points to hours</div>
        <p className="text-xs text-slate-400">
          A calibration knob, not learned from data. Default is 4 hours per point.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {POINT_KEYS.map((k) => (
            <NumberField
              key={k}
              id={`cfg-pts-${k}`}
              label={`${k} pt`}
              value={values.points_to_hours[k]}
              error={errors[`points_to_hours.${k}`]}
              onChange={(v) => set('points_to_hours', { ...values.points_to_hours, [k]: v })}
            />
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="text-xs font-medium text-slate-700">Sprint packing</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {(
            [
              [
                'relaxed',
                'Relaxed',
                'A task and its dependency may share a sprint, bounded by sprint hours.',
              ],
              [
                'strict',
                'Strict',
                'A task starts only in a sprint after all of its dependencies finish.',
              ],
            ] as const
          ).map(([mode, title, text]) => (
            <label
              key={mode}
              className={clsx(
                'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm',
                values.pack_mode === mode
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <input
                type="radio"
                name="pack_mode"
                value={mode}
                checked={values.pack_mode === mode}
                onChange={() => set('pack_mode', mode)}
                className="mt-1"
              />
              <span>
                <span className="block font-medium text-slate-800">{title}</span>
                <span className="block text-xs text-slate-500">{text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-slate-50 p-3">
        <ul className="space-y-1" aria-label="Capacity rules">
          <Invariant ok={invariants.capacityOk}>
            {`Capacity C = ${derived.capacity ?? '?'} points per sprint must be at least 13`}
          </Invariant>
          <Invariant ok={invariants.hoursOk}>
            {`Sprint hours H = ${derived.sprintHours ?? '?'} must fit the largest task (${derived.hours13 ?? '?'} h)`}
          </Invariant>
        </ul>
        <Button
          size="sm"
          variant="ghost"
          disabled={isDefault}
          onClick={() => onChange(defaultFormValues())}
        >
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
