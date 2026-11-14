import { useState } from 'react';
import { api } from '../api/client';
import { errorMessage } from '../api/errors';
import { EXPORT_LABELS } from '../api/types';
import type { ExportKind, Plan } from '../api/types';
import { downloadFile } from '../lib/exporters';
import { Button } from './ui';

const KINDS: ExportKind[] = ['jira', 'markdown', 'json'];

/** Jira CSV, Markdown and JSON. In fixture mode the files are generated in the browser. */
export function ExportButtons({ plan }: { plan: Plan }) {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: ExportKind) {
    setBusy(kind);
    setError(null);
    try {
      downloadFile(await api.exportPlan(plan, kind));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Export the plan">
        <span className="text-xs font-medium text-slate-500">Export</span>
        {KINDS.map((k) => (
          <Button key={k} size="sm" disabled={busy !== null} onClick={() => void run(k)}>
            {busy === k ? 'Preparing…' : EXPORT_LABELS[k]}
          </Button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          Export failed: {error}
        </p>
      ) : null}
    </div>
  );
}
