import { describe, expect, it } from 'vitest';
import { loadGoldenPlan } from './testPlan';
import { runWhatIf, sameSettings, settingsFromPlan } from './whatif';

const plan = loadGoldenPlan();
const base = settingsFromPlan(plan);

describe('runWhatIf', () => {
  it('reproduces the stored schedule with the plan settings', () => {
    const r = runWhatIf(plan, base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.schedule.capacity_plan).toEqual(plan.schedule.capacity_plan);
    expect(r.schedule.cpm).toEqual(plan.schedule.cpm);
    expect(r.schedule.tasks).toEqual(plan.schedule.tasks);
    expect(r.schedule.sprints).toEqual(plan.schedule.sprints);
  });

  it('needs more sprints with a smaller team, and CPM does not move', () => {
    const r = runWhatIf(plan, { ...base, team_size: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sprintCount).toBeGreaterThan(plan.schedule.capacity_plan.sprint_count);
    expect(r.schedule.cpm.duration_hours).toBe(plan.schedule.cpm.duration_hours);
    expect(r.capacityPoints).toBe(2 * base.velocity_points_per_person);
  });

  it('never needs more sprints with a bigger team', () => {
    const r = runWhatIf(plan, { ...base, team_size: 8 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sprintCount).toBeLessThanOrEqual(plan.schedule.capacity_plan.sprint_count);
  });

  it('puts every task in exactly one sprint', () => {
    for (const team of [2, 3, 4, 6, 10]) {
      const r = runWhatIf(plan, { ...base, team_size: team });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const ids = r.schedule.sprints.flatMap((s) => s.task_ids);
      expect(new Set(ids).size).toBe(plan.tasks.length);
      expect(ids.length).toBe(plan.tasks.length);
    }
  });

  it('supports strict packing', () => {
    const r = runWhatIf(plan, { ...base, pack_mode: 'strict' });
    expect(r.ok).toBe(true);
  });

  it('rejects a capacity below the largest task (C >= 13) with a readable reason', () => {
    const r = runWhatIf(plan, { ...base, team_size: 1, velocity_points_per_person: 5 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons.join(' ')).toMatch(/at least 13/);
  });
});

describe('sameSettings', () => {
  it('compares all three knobs', () => {
    expect(sameSettings(base, { ...base })).toBe(true);
    expect(sameSettings(base, { ...base, pack_mode: 'strict' })).toBe(false);
    expect(sameSettings(base, { ...base, team_size: base.team_size + 1 })).toBe(false);
  });
});
