import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PlanSchema, findPlanIntegrityProblems } from '@spm/shared';
import { toJiraCsv } from '../src/index.js';
import { FIXTURE_URL, SAMPLE_CSV_URL, loadFixture } from './helpers.js';

describe('food-delivery fixture', () => {
  const raw = readFileSync(FIXTURE_URL, 'utf8');
  const plan = loadFixture();

  it('passes PlanSchema and the integrity check', () => {
    expect(PlanSchema.safeParse(JSON.parse(raw)).success).toBe(true);
    expect(findPlanIntegrityProblems(plan)).toEqual([]);
  });

  it('is the size the UI is built against', () => {
    expect(plan.requirements.length).toBeGreaterThanOrEqual(12);
    expect(
      plan.requirements.filter((r) => r.type === 'non_functional').length,
    ).toBeGreaterThanOrEqual(3);
    expect(plan.epics).toHaveLength(4);
    expect(plan.stories.length).toBeGreaterThanOrEqual(10);
    expect(plan.tasks.length).toBeGreaterThanOrEqual(25);
    expect(plan.dependencies.length).toBeGreaterThanOrEqual(30);
    expect(new Set(plan.tasks.map((t) => t.layer)).size).toBe(7);
  });

  it('has 4 or 5 risks that all cite computed signals', () => {
    expect(plan.risks.length).toBeGreaterThanOrEqual(4);
    expect(plan.risks.length).toBeLessThanOrEqual(5);
    const ids = new Set(plan.signals.map((s) => s.id));
    for (const risk of plan.risks) {
      expect(risk.signal_ids.length).toBeGreaterThan(0);
      for (const id of risk.signal_ids) expect(ids.has(id)).toBe(true);
    }
  });

  it('is clearly a hand-written test fixture, not model output', () => {
    expect(plan.run.llm.provider).toBe('fixture');
    expect(plan.run.llm.model).toBe('hand-written');
  });

  it('keeps docs/samples/jira-sample.csv in step with the exporter', () => {
    const normalise = (s: string) => s.replace(/\r\n/g, '\n');
    expect(normalise(readFileSync(SAMPLE_CSV_URL, 'utf8'))).toBe(normalise(toJiraCsv(plan)));
  });
});
