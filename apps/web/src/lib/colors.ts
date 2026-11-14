/** Epic colours, assigned in epic order. Chosen to stay distinct from the critical-path red. */
export const EPIC_COLORS = [
  '#2563eb', // blue
  '#7c3aed', // violet
  '#0d9488', // teal
  '#d97706', // amber
  '#db2777', // pink
  '#4d7c0f', // olive
  '#0891b2', // cyan
  '#64748b', // slate
];

export const CRITICAL_COLOR = '#dc2626';

export function epicColor(index: number): string {
  return EPIC_COLORS[index % EPIC_COLORS.length] ?? '#64748b';
}

export const LAYER_STYLES: Record<string, string> = {
  frontend: 'bg-sky-50 text-sky-700 ring-sky-200',
  backend: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  database: 'bg-amber-50 text-amber-800 ring-amber-200',
  devops: 'bg-slate-100 text-slate-700 ring-slate-300',
  testing: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  design: 'bg-pink-50 text-pink-700 ring-pink-200',
  integration: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-red-50 text-red-700 ring-red-200',
  medium: 'bg-amber-50 text-amber-800 ring-amber-200',
  low: 'bg-slate-100 text-slate-600 ring-slate-300',
  error: 'bg-red-50 text-red-700 ring-red-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export const PRIORITY_STYLES: Record<string, string> = {
  must: 'bg-red-50 text-red-700 ring-red-200',
  should: 'bg-amber-50 text-amber-800 ring-amber-200',
  could: 'bg-slate-100 text-slate-600 ring-slate-300',
};
