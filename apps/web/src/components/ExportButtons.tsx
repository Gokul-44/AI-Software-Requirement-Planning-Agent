import clsx from 'clsx';
import { ChevronDown, Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { USE_FIXTURE, api } from '../api/client';
import { errorMessage } from '../api/errors';
import { EXPORT_LABELS } from '../api/types';
import type { ExportKind, Plan } from '../api/types';
import { downloadFile } from '../lib/exporters';
import { useToast } from './toastContext';
import { Button } from './ui';

const KINDS: ExportKind[] = ['jira', 'markdown', 'json'];

/**
 * Jira CSV, Markdown and JSON. In live mode the CSV and the Markdown come from the API export
 * endpoints; in fixture mode they are generated in the browser. Wide screens show three buttons,
 * phones one menu.
 */
export function ExportButtons({ plan }: { plan: Plan }) {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function run(kind: ExportKind) {
    setOpen(false);
    setBusy(kind);
    try {
      const file = await api.exportPlan(plan, kind);
      downloadFile(file);
      toast(
        'success',
        `${EXPORT_LABELS[kind]} exported`,
        `${file.filename} was saved${USE_FIXTURE ? '' : ' from the server'}.`,
      );
    } catch (e) {
      toast('error', `${EXPORT_LABELS[kind]} export failed`, errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const label = (k: ExportKind) => (busy === k ? 'Preparing…' : EXPORT_LABELS[k]);

  return (
    <div className="relative" ref={menuRef}>
      <div className="hidden items-center gap-2 sm:flex" role="group" aria-label="Export the plan">
        <span className="text-xs font-medium text-muted">Export</span>
        {KINDS.map((k) => (
          <Button key={k} size="sm" disabled={busy !== null} onClick={() => void run(k)}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {label(k)}
          </Button>
        ))}
      </div>
      <div className="sm:hidden">
        <Button
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          disabled={busy !== null}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export
          <ChevronDown
            className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </Button>
        {open ? (
          <div
            role="menu"
            className="spm-fade-in absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-surface py-1 shadow-lift"
          >
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="menuitem"
                onClick={() => void run(k)}
                className="block w-full px-4 py-2.5 text-left text-sm font-medium text-text hover:bg-sand-100"
              >
                {label(k)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
