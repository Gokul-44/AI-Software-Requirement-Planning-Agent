import { describe, expect, it } from 'vitest';
import { buildGantt } from './gantt';
import { loadGoldenPlan } from './testPlan';

const plan = loadGoldenPlan();

describe('buildGantt', () => {
  it('draws the capacity plan from planned_start to planned_finish', () => {
    const g = buildGantt(plan.schedule, 'sprint');
    expect(g.bars).toHaveLength(plan.tasks.length);
    const byId = new Map(plan.schedule.tasks.map((t) => [t.task_id, t]));
    for (const b of g.bars) {
      const t = byId.get(b.taskId);
      expect(b.start).toBe(t?.planned_start);
      expect(b.end).toBe(t?.planned_finish);
      expect(b.floatEnd).toBeNull();
      expect(b.critical).toBe(t?.critical);
    }
  });

  it('draws CPM from es to ef with slack as float and keeps the critical flags', () => {
    const g = buildGantt(plan.schedule, 'cpm');
    const byId = new Map(plan.schedule.tasks.map((t) => [t.task_id, t]));
    for (const b of g.bars) {
      const t = byId.get(b.taskId);
      expect(b.start).toBe(t?.es);
      expect(b.end).toBe(t?.ef);
      expect(b.critical).toBe(t?.critical);
      expect(b.floatEnd).toBe(t && t.slack > 0 ? t.lf : null);
    }
  });

  it('uses one scale for both views and reports where each schedule ends', () => {
    const a = buildGantt(plan.schedule, 'sprint');
    const b = buildGantt(plan.schedule, 'cpm');
    expect(a.totalHours).toBe(b.totalHours);
    expect(a.ownEndHours).toBe(b.otherEndHours);
    expect(b.ownEndHours).toBe(plan.schedule.cpm.duration_hours);
    expect(a.ownEndHours).toBe(
      plan.schedule.capacity_plan.sprint_count * plan.schedule.capacity_plan.hours_per_sprint,
    );
    // the CPM lower bound never exceeds the capacity-feasible plan
    expect(b.ownEndHours).toBeLessThanOrEqual(a.ownEndHours);
  });

  it('has one sprint band per sprint', () => {
    const g = buildGantt(plan.schedule, 'sprint');
    expect(g.bands.length).toBe(plan.schedule.capacity_plan.sprint_count);
    expect(g.bands[0]?.start).toBe(0);
  });
});
