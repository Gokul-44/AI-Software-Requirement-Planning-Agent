import { readFileSync } from 'node:fs';
import { assertPlanIntegrity, PlanSchema } from '@spm/shared';
import type { Plan } from '@spm/shared';

const repoFile = (...parts: string[]): URL =>
  new URL(`../../../${parts.join('/')}`, import.meta.url);

export const FIXTURE_URL = repoFile('fixtures', 'plan.food-delivery.json');
export const GOLDEN_URL = repoFile('apps', 'web', 'public', 'golden', 'food-delivery.json');
export const SAMPLE_CSV_URL = repoFile('docs', 'samples', 'jira-sample.csv');

/** A fresh, validated copy of the food-delivery fixture on every call. */
export function loadFixture(): Plan {
  const plan = PlanSchema.parse(JSON.parse(readFileSync(FIXTURE_URL, 'utf8')));
  assertPlanIntegrity(plan);
  return plan;
}

/** Minimal RFC 4180 reader (quoted fields, doubled quotes, CRLF or LF inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text.charAt(i + 1) === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
    i++;
  }
  if (quoted) throw new Error('Unterminated quoted field.');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
