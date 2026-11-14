import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark' | 'outline-light';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Button styles, shared by buttons and links. White on the accent is only used for bold labels:
 * `lg` is 16 px bold on #8B5CF6; the smaller sizes use the darker accent-600 / accent-700.
 */
export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return clsx(
    'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition duration-200 focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' && 'px-3.5 py-1.5 text-xs',
    size === 'md' && 'px-4.5 py-2 text-sm',
    size === 'lg' && 'px-6 py-3 text-base',
    variant === 'primary' &&
      (size === 'lg'
        ? 'bg-accent-500 text-white shadow-md hover:-translate-y-0.5 hover:bg-accent-600 hover:shadow-lg'
        : 'bg-accent-600 text-white shadow-sm hover:bg-accent-700'),
    variant === 'secondary' &&
      'border border-sand-500 bg-surface text-brand-green-900 shadow-sm hover:bg-sand-100',
    variant === 'ghost' && 'text-brand-green-800 hover:bg-sand-200',
    variant === 'danger' && 'bg-red-700 text-white hover:bg-red-800',
    variant === 'dark' && 'bg-brand-green-900 text-sand-100 hover:bg-brand-green-800',
    variant === 'outline-light' &&
      'border border-sand-300/50 text-sand-100 hover:bg-sand-100/10 hover:border-sand-300',
    className,
  );
}
