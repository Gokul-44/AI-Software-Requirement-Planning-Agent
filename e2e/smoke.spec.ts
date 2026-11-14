import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Download } from '@playwright/test';
import { API_PORT } from './ports.js';

interface PlanShape {
  epics: unknown[];
  stories: unknown[];
  tasks: { id: string }[];
}

/** Minimal RFC 4180 reader: quoted cells may hold commas, doubled quotes and line breaks. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function readDownload(download: Download): Promise<string> {
  const file = await download.path();
  return readFileSync(file, 'utf8');
}

test('idea to plan, then download the Jira CSV and the Markdown', async ({ page, request }) => {
  // The stack must be the mock one: no model key, nothing stored in a database.
  const health = await request.get(`http://localhost:${API_PORT}/api/health`);
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ status: 'ok', llm_configured: true });

  // 1. Enter an idea and start the run.
  await page.goto('/');
  await page
    .getByLabel('Describe your software idea in one line')
    .fill('I want an online food delivery app');
  await page.getByRole('button', { name: 'Generate plan' }).click();

  // 2. The run page appears, then the plan opens by itself when the run has succeeded.
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}\/plan/, { timeout: 90_000 });
  const runId = /\/runs\/([0-9a-f-]{36})\//.exec(page.url())?.[1];
  expect(runId).toBeDefined();
  await expect(page.getByRole('button', { name: 'Jira CSV' })).toBeVisible();

  // The plan the API holds is the reference for the counts below.
  const planResponse = await request.get(`http://localhost:${API_PORT}/api/runs/${runId}/plan`);
  expect(planResponse.ok()).toBe(true);
  const plan = (await planResponse.json()) as PlanShape;
  expect(plan.tasks.length).toBeGreaterThan(0);
  const taskCodes = plan.tasks.map((t) => t.id);
  expect(taskCodes.every((code) => /^T-\d{3}$/.test(code))).toBe(true);

  // 3. Download the Jira CSV: one header row, then one row per epic, story and task.
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Jira CSV' }).click();
  const csvFile = await csvDownload;
  expect(csvFile.suggestedFilename()).toMatch(/jira\.csv$/);
  const csv = parseCsv(await readDownload(csvFile));
  const header = csv[0] ?? [];
  expect(header.slice(0, 4)).toEqual(['Issue Id', 'Parent Id', 'Issue Type', 'Summary']);
  expect(header).toContain('Blocked By');
  const dataRows = csv.slice(1);
  expect(dataRows).toHaveLength(plan.epics.length + plan.stories.length + plan.tasks.length);
  const subtasks = dataRows.filter((r) => r[2] === 'Sub-task');
  expect(subtasks).toHaveLength(plan.tasks.length);
  // Every row has as many cells as the header, so no quoted cell broke the file.
  for (const r of dataRows) expect(r).toHaveLength(header.length);
  // Every T-code is the start of exactly one Sub-task summary.
  const summaries = subtasks.map((r) => r[3] ?? '');
  for (const code of taskCodes) {
    expect(summaries.filter((s) => s.startsWith(`${code} `))).toHaveLength(1);
  }

  // 4. Download the Markdown: every T-code appears in it.
  const mdDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Markdown' }).click();
  const mdFile = await mdDownload;
  expect(mdFile.suggestedFilename()).toMatch(/\.md$/);
  const markdown = await readDownload(mdFile);
  const missing = taskCodes.filter((code) => !markdown.includes(code));
  expect(missing).toEqual([]);
});
