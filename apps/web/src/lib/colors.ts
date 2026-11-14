/**
 * Chart and badge colours. Every value is a design token from src/index.css (docs/DESIGN.md):
 * no hex values live here. Purple (accent) is reserved for the critical path, so epic colours are
 * tints and shades of the forest green and the sand beige only.
 */
export const EPIC_COLORS = Array.from({ length: 8 }, (_, i) => `var(--color-epic-${i + 1})`);

/**
 * The critical path is the one thing drawn in the accent colour. It uses accent-600, not the
 * brand value accent-500: light labels on the bars then reach 5.5:1 (on accent-500 only 4.1:1).
 */
export const CRITICAL_COLOR = 'var(--color-accent-600)';
/** Outline for critical bars and nodes: dark enough to separate purple from the sand. */
export const CRITICAL_STROKE = 'var(--color-accent-800)';
export const INK_COLOR = 'var(--color-brand-green-950)';
export const MUTED_EDGE = 'var(--color-sand-600)';
export const GRID_COLOR = 'var(--color-sand-400)';

export function epicColor(index: number): string {
  return EPIC_COLORS[index % EPIC_COLORS.length] ?? EPIC_COLORS[0] ?? 'var(--color-sand-600)';
}

/** Layer badges: brand neutrals only, told apart by lightness and the label itself. */
export const LAYER_STYLES: Record<string, string> = {
  frontend: 'bg-brand-green-100 text-brand-green-800 ring-brand-green-200',
  backend: 'bg-brand-green-800 text-brand-green-50 ring-brand-green-800',
  database: 'bg-sand-300 text-sand-900 ring-sand-400',
  devops: 'bg-sand-100 text-sand-800 ring-sand-400',
  testing: 'bg-brand-green-50 text-brand-green-700 ring-brand-green-300',
  design: 'bg-sand-200 text-sand-800 ring-sand-400',
  integration: 'bg-brand-green-200 text-brand-green-900 ring-brand-green-300',
};

/** Status colours stay separate from the brand: red high/error, amber medium/warning, green low. */
export const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-red-50 text-red-800 ring-red-200',
  medium: 'bg-amber-50 text-amber-900 ring-amber-200',
  low: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  error: 'bg-red-50 text-red-800 ring-red-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  info: 'bg-sand-100 text-sand-800 ring-sand-400',
};

/** Priority is not a status, so it uses brand neutrals (a darker fill means more important). */
export const PRIORITY_STYLES: Record<string, string> = {
  must: 'bg-brand-green-900 text-brand-green-50 ring-brand-green-900',
  should: 'bg-brand-green-100 text-brand-green-800 ring-brand-green-200',
  could: 'bg-sand-100 text-sand-800 ring-sand-400',
};
