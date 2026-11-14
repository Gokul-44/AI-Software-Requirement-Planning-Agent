import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ToastContext } from './toastContext';
import type { ToastKind } from './toastContext';

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

let nextId = 1;

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info } as const;
const TONES: Record<ToastKind, string> = {
  success: 'text-emerald-700',
  error: 'text-red-700',
  info: 'text-accent-700',
};

/** Toasts for exports, re-runs and errors. They close by themselves after 5 s (8 s for errors). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback(
    (id: number) => setItems((all) => all.filter((t) => t.id !== id)),
    [],
  );

  const toast = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = nextId++;
      setItems((all) => [...all.slice(-3), { id, kind, title, ...(message ? { message } : {}) }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 5000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 left-4 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:w-96"
      >
        {items.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className="spm-fade-in pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-lift"
            >
              <Icon className={clsx('mt-0.5 h-5 w-5 shrink-0', TONES[t.kind])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-text">{t.title}</div>
                {t.message ? <p className="mt-0.5 text-sm text-muted">{t.message}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="rounded-md p-1 text-muted hover:bg-sand-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
