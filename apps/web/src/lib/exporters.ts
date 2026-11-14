import { toJiraCsv, toMarkdown } from '@spm/exporters';
import type { ExportFile, ExportKind, Plan } from '../api/types';

const BASENAME = 'plan';

/** Generates an export in the browser (pure functions from @spm/exporters). */
export function exportPlanLocally(plan: Plan, kind: ExportKind): ExportFile {
  switch (kind) {
    case 'jira':
      return {
        filename: `${BASENAME}-jira.csv`,
        mime: 'text/csv;charset=utf-8',
        content: toJiraCsv(plan),
      };
    case 'markdown':
      return {
        filename: `${BASENAME}.md`,
        mime: 'text/markdown;charset=utf-8',
        content: toMarkdown(plan),
      };
    case 'json':
      return {
        filename: `${BASENAME}.json`,
        mime: 'application/json;charset=utf-8',
        content: `${JSON.stringify(plan, null, 2)}\n`,
      };
  }
}

/** Saves a file through a temporary link. */
export function downloadFile(file: ExportFile): void {
  const blob = new Blob([file.content], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
