import clsx from 'clsx';

/**
 * The logo mark: three stepped bars (a schedule climbing to its end) and a node. Original artwork:
 * sand bars on forest green, with the accent on the critical bar and the node.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx('h-9 w-9', className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-brand-green-900" />
      <rect x="6" y="19" width="10" height="3.5" rx="1.75" className="fill-sand-300" />
      <rect x="11" y="13" width="10" height="3.5" rx="1.75" className="fill-sand-300" />
      <rect x="16" y="7" width="10" height="3.5" rx="1.75" className="fill-accent-500" />
      <circle cx="24.5" cy="23.5" r="2.5" className="fill-accent-500" />
    </svg>
  );
}

export function Logo({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="leading-tight">
        <span
          className={clsx(
            'block text-sm font-semibold tracking-tight',
            tone === 'light' ? 'text-sand-50' : 'text-brand-green-950',
          )}
        >
          Planning Agent
        </span>
        <span
          className={clsx('block text-[11px]', tone === 'light' ? 'text-sand-300' : 'text-muted')}
        >
          AI generates, algorithms verify
        </span>
      </span>
    </span>
  );
}
