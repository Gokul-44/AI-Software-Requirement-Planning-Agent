import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LAYER_STYLES, PRIORITY_STYLES, SEVERITY_STYLES } from '../lib/colors';
import { errorCode, errorMessage } from '../api/errors';

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-slate-200 bg-white shadow-sm',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  hint,
  right,
}: {
  title: string;
  hint?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-slate-500">{hint}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function Badge({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        className ?? 'bg-slate-100 text-slate-700 ring-slate-200',
      )}
    >
      {children}
    </span>
  );
}

export const LayerBadge = ({ layer }: { layer: string }) => (
  <Badge className={LAYER_STYLES[layer]}>{layer}</Badge>
);
export const PriorityBadge = ({ priority }: { priority: string }) => (
  <Badge className={PRIORITY_STYLES[priority]}>{priority}</Badge>
);
export const SeverityBadge = ({ severity }: { severity: string }) => (
  <Badge className={SEVERITY_STYLES[severity]}>{severity}</Badge>
);

export function CriticalBadge({ title }: { title?: string }) {
  return (
    <Badge
      className="bg-red-600 text-white ring-red-600"
      title={title ?? 'On the critical path: zero slack'}
    >
      critical
    </Badge>
  );
}

export function Stat({
  label,
  value,
  unit,
  note,
  tone = 'default',
  title,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'brand';
  title?: string;
}) {
  const toneClass = {
    default: 'text-slate-900',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
    brand: 'text-brand-700',
  }[tone];
  return (
    <div
      title={title}
      className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div
        className={clsx(
          'mt-1 flex items-baseline gap-1.5 text-3xl font-semibold tabular-nums',
          toneClass,
        )}
      >
        {value}
        {unit ? <span className="text-sm font-medium text-slate-500">{unit}</span> : null}
      </div>
      {note ? <div className="mt-1 text-xs text-slate-500">{note}</div> : null}
    </div>
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        variant === 'primary' && 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
        variant === 'secondary' &&
          'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
    />
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-slate-500">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label}
    </div>
  );
}

export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

export function EmptyState({
  title,
  children,
  icon = '∅',
}: {
  title: string;
  children?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-500">
        {icon}
      </div>
      <div className="font-medium text-slate-800">{title}</div>
      {children ? <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div> : null}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const code = errorCode(error);
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5">
      <div className="font-semibold text-red-800">{title}</div>
      <p className="mt-1 text-sm text-red-700">{errorMessage(error)}</p>
      {code ? <p className="mt-1 font-mono text-xs text-red-500">{code}</p> : null}
      {onRetry ? (
        <Button className="mt-3" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** A clickable task reference, e.g. "T-014". Opens the task details. */
export function IdChip({
  id,
  onClick,
  critical,
  title,
}: {
  id: string;
  onClick?: () => void;
  critical?: boolean;
  title?: string;
}) {
  const base =
    'inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-xs font-medium ring-1 ring-inset';
  const tone = critical
    ? 'bg-red-50 text-red-700 ring-red-200'
    : 'bg-slate-100 text-slate-700 ring-slate-200';
  if (!onClick) return <span className={clsx(base, tone)}>{id}</span>;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        base,
        tone,
        'cursor-pointer transition-colors hover:bg-brand-50 hover:text-brand-700 hover:ring-brand-200',
      )}
    >
      {id}
    </button>
  );
}

export function ProgressBar({
  value,
  danger,
  warn,
  label,
}: {
  /** 0..1 (may exceed 1). */
  value: number;
  danger?: boolean;
  warn?: boolean;
  label?: string;
}) {
  const width = Math.min(100, Math.max(0, value * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
    >
      <div
        className={clsx(
          'h-full rounded-full transition-all',
          danger ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-emerald-500',
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function Select({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx('flex flex-col gap-1 text-xs font-medium text-slate-600', className)}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal text-slate-800 shadow-sm"
      >
        {children}
      </select>
    </label>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
