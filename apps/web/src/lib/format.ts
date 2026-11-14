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

export function capacityRatio(capacityDays: number, cpmDays: number): number | null {
  return cpmDays > 0 ? capacityDays / cpmDays : null;
}

/** Elapsed time as m:ss. */
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
