import { describe, expect, it } from 'vitest';
import { exportPlanLocally } from './exporters';
import { loadGoldenPlan } from './testPlan';

const plan = loadGoldenPlan();

describe('exportPlanLocally', () => {
  it('builds a Jira CSV that lists every task', () => {
    const f = exportPlanLocally(plan, 'jira');
    expect(f.filename).toMatch(/\.csv$/);
    expect(f.mime).toMatch(/^text\/csv/);
    expect(f.content.startsWith('Issue Id,Parent Id,Issue Type,Summary')).toBe(true);
    for (const t of plan.tasks) expect(f.content).toContain(t.id);
  });

  it('builds Markdown that mentions every requirement', () => {
    const f = exportPlanLocally(plan, 'markdown');
    expect(f.filename).toMatch(/\.md$/);
    for (const r of plan.requirements) expect(f.content).toContain(r.id);
  });

  it('builds JSON that round-trips', () => {
    const f = exportPlanLocally(plan, 'json');
    expect(JSON.parse(f.content)).toEqual(plan);
  });
});
