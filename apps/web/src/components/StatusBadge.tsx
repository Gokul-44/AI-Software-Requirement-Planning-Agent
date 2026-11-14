import { Badge } from './ui';
import type { RunStatus } from '../api/types';

const STYLES: Record<RunStatus['status'], { cls: string; label: string }> = {
  queued: { cls: 'bg-sand-100 text-sand-800 ring-sand-400', label: 'queued' },
  running: {
    cls: 'bg-brand-green-100 text-brand-green-800 ring-brand-green-300',
    label: 'running',
  },
  needs_resolution: {
    cls: 'bg-amber-50 text-amber-900 ring-amber-200',
    label: 'needs your decision',
  },
  succeeded: { cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200', label: 'succeeded' },
  failed: { cls: 'bg-red-50 text-red-800 ring-red-200', label: 'failed' },
};

/** Run status as a badge. Status colours only: green done, amber waiting, red failed. */
export function StatusBadge({ status }: { status: RunStatus['status'] | null }) {
  if (!status) return <Badge>no run</Badge>;
  const s = STYLES[status];
  return <Badge className={s.cls}>{s.label}</Badge>;
}
