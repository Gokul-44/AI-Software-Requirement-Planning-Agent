import clsx from 'clsx';
import { AlertTriangle, Inbox, Sparkles } from 'lucide-react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useGolden } from '../api/hooks';
import { buttonClass } from '../lib/buttonClass';
import type { ButtonSize, ButtonVariant } from '../lib/buttonClass';
import { friendlyError } from '../lib/friendlyError';
import { CRITICAL_COLOR, LAYER_STYLES, PRIORITY_STYLES, SEVERITY_STYLES } from '../lib/colors';

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
        'rounded-2xl border border-border bg-surface shadow-card',
        padded && 'p-5 sm:p-6',
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
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold text-text sm:text-lg">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-muted">{hint}</p> : null}
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
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        className ?? 'bg-sand-100 text-brand-green-800 ring-sand-400',
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
      className="bg-accent-700 text-white ring-accent-700"
      title={title ?? 'On the critical path: zero slack'}
    >
      critical
    </Badge>
  );
}

/** KPI tile. `tone` colours the value with a status colour; "brand" uses the accent. */
export function Stat({
  label,
  value,
  unit,
  note,
  tone = 'default',
  title,
  icon,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'brand';
  title?: string;
  icon?: ReactNode;
}) {
  const toneClass = {
    default: 'text-text',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
    brand: 'text-accent-700',
  }[tone];
  return (
    <div
      title={title}
      className="spm-lift flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
        {icon ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-green-100 text-brand-green-800">
            {icon}
          </span>
        ) : null}
      </div>
      <div
        className={clsx(
          'mt-2 flex items-baseline gap-1.5 text-3xl font-semibold tracking-tight tabular-nums',
          toneClass,
        )}
      >
        {value}
        {unit ? <span className="text-sm font-medium text-muted">{unit}</span> : null}
      </div>
      {note ? <div className="mt-1 text-xs text-muted">{note}</div> : null}
    </div>
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <button type="button" {...props} className={buttonClass(variant, size, className)} />;
}

/** A loading placeholder block. Used instead of spinners. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" style={style} className={clsx('spm-skeleton', className)} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <Skeleton className="h-5 w-1/3" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={clsx('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </div>
  );
}

export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-5">
      <Skeleton className="h-8 w-1/2" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
      <SkeletonCard lines={5} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  icon,
  action,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-sand-500 bg-surface px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-green-100 text-brand-green-800">
        {icon ?? <Inbox className="h-6 w-6" aria-hidden="true" />}
      </div>
      <div className="text-base font-semibold text-text">{title}</div>
      {children ? <div className="mt-1 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** "Open a golden demo plan": opens the first recorded plan, or the home page demo gallery. */
export function GoldenDemoButton({
  size = 'md',
  label = 'Open a golden demo plan',
  variant = 'primary',
}: {
  size?: ButtonSize;
  label?: string;
  variant?: ButtonVariant;
}) {
  const golden = useGolden();
  const first = golden.data?.[0];
  return (
    <Link
      to={first ? `/runs/${first.run_id}/plan` : '/#demos'}
      className={buttonClass(variant, size)}
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

export function ErrorState({
  error,
  onRetry,
  title,
}: {
  error: unknown;
  onRetry?: () => void;
  /** Overrides the friendly title (the friendly message is kept). */
  title?: string;
}) {
  const f = friendlyError(error);
  const requestId =
    typeof error === 'object' && error !== null && 'requestId' in error
      ? (error as { requestId: string | null }).requestId
      : null;
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
          <AlertTriangle className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-red-900">{title ?? f.title}</div>
          <p className="mt-1 text-sm text-red-900">{f.message}</p>
          {f.code ? (
            <p className="mt-1.5 font-mono text-xs text-red-800">
              {f.code}
              {requestId ? ` · request ${requestId}` : ''}
            </p>
          ) : null}
          {onRetry || f.offerGolden ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {f.offerGolden ? <GoldenDemoButton size="sm" /> : null}
              {onRetry ? (
                <Button size="sm" onClick={onRetry}>
                  Try again
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
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
    ? 'bg-accent-50 text-accent-800 ring-accent-300'
    : 'bg-sand-200 text-brand-green-800 ring-sand-400';
  if (!onClick) return <span className={clsx(base, tone)}>{id}</span>;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        base,
        tone,
        'cursor-pointer transition-colors hover:bg-accent-100 hover:text-accent-900 hover:ring-accent-300',
      )}
    >
      {id}
    </button>
  );
}

/** A meter. Green is good, amber a warning, red a problem (status colours, never the accent). */
export function ProgressBar({
  value,
  danger,
  warn,
  label,
  className,
}: {
  /** 0..1 (may exceed 1). */
  value: number;
  danger?: boolean;
  warn?: boolean;
  label?: string;
  className?: string;
}) {
  const width = Math.min(100, Math.max(0, value * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={clsx('h-2.5 w-full overflow-hidden rounded-full bg-sand-200', className)}
    >
      <div
        className={clsx(
          'h-full rounded-full transition-all duration-500',
          danger ? 'bg-red-600' : warn ? 'bg-amber-500' : 'bg-emerald-600',
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
    <label className={clsx('flex flex-col gap-1 text-xs font-medium text-muted', className)}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-sand-400 bg-surface px-2.5 py-1.5 text-sm font-normal text-text shadow-sm"
      >
        {children}
      </select>
    </label>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-green-800">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            className={clsx(
              'inline-block h-2.5 w-2.5 rounded-sm',
              i.color === CRITICAL_COLOR && 'ring-1 ring-accent-800',
            )}
            style={{ background: i.color }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
