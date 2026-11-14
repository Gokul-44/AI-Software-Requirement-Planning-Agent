/** Working days for display: hours / focus hours per day, to one decimal when needed. */
export function hoursToDays(hours: number, focusHoursPerDay: number): number {
  return Math.round((hours / focusHoursPerDay) * 2) / 2;
}

export function formatDays(days: number): string {
  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}

export function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60)} s`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatCost(usd: number): string {
  return usd < 0.01 && usd > 0 ? '< $0.01' : `$${usd.toFixed(2)}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Capacity-bound ratio thresholds follow the scheduler's `capacity_bound` signal (1.5x). */
export const CAPACITY_BOUND_RATIO = 1.5;

/**
 * Capacity-feasible hours (sprints x hours per sprint) divided by the CPM hours. Computed once,
 * from hours, so every screen shows the same number as the scheduler's `capacity_bound` signal
 * (never from the rounded day counts).
 */
export function capacityRatio(
  capacityPlan: { sprint_count: number; hours_per_sprint: number },
  cpmHours: number,
): number | null {
  return cpmHours > 0
    ? (capacityPlan.sprint_count * capacityPlan.hours_per_sprint) / cpmHours
    : null;
}

/** The ratio as shown everywhere: two decimals and a multiplication sign, e.g. "1.55×". */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}×`;
}

/** Elapsed time as m:ss. */
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Signal kinds whose value and threshold are shares (0 to 1) and read as percentages. */
export const PERCENT_SIGNAL_KINDS: ReadonlySet<string> = new Set([
  'critical_path_length',
  'sprint_overload',
  'critical_layer_concentration',
  'layer_imbalance',
]);

/**
 * A signal's value or threshold as the Risks tab shows it, matching the wording of the signal's
 * own message: shares as whole percentages ("98%"), the capacity ratio as "1.55×", anything else
 * as a plain number with at most two decimals.
 *
 * `layer_imbalance` also emits a count-style value (0 with threshold 1 for "no devops tasks"), which
 * is not a share, so it is shown as a percentage only when the threshold is below 1.
 */
export function formatSignalNumber(
  kind: string,
  n: number,
  context: { threshold: number | null } = { threshold: null },
): string {
  if (kind === 'capacity_bound') return formatRatio(n);
  if (PERCENT_SIGNAL_KINDS.has(kind)) {
    const isShare =
      kind !== 'layer_imbalance' || (context.threshold !== null && context.threshold < 1);
    if (isShare) return `${Math.round(n * 100)}%`;
  }
  return String(Number(n.toFixed(2)));
}
