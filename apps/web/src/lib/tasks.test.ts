import { describe, expect, it } from 'vitest';
import { loadGoldenPlan } from './testPlan';
import { NO_FILTERS, buildTaskRows, filterTasks, sortTasks } from './tasks';

const plan = loadGoldenPlan();
const rows = buildTaskRows(plan, plan.schedule);

describe('tasks table helpers', () => {
  it('joins every task with its epic and schedule', () => {
    expect(rows).toHaveLength(plan.tasks.length);
    expect(rows.every((r) => r.epicTitle !== '' && r.sprint >= 1)).toBe(true);
  });

  it('filters by critical, epic, layer and text', () => {
    const critical = filterTasks(rows, { ...NO_FILTERS, criticalOnly: true });
    expect(critical.map((r) => r.id).sort()).toEqual([...plan.schedule.cpm.critical_path].sort());

    const epic = plan.epics[0]?.id ?? '';
    expect(filterTasks(rows, { ...NO_FILTERS, epic }).every((r) => r.epicId === epic)).toBe(true);

    const backend = filterTasks(rows, { ...NO_FILTERS, layer: 'backend' });
    expect(backend.length).toBeGreaterThan(0);
    expect(backend.every((r) => r.layer === 'backend')).toBe(true);

    expect(filterTasks(rows, { ...NO_FILTERS, query: 't-002' }).map((r) => r.id)).toEqual([
      'T-002',
    ]);
    expect(filterTasks(rows, { ...NO_FILTERS, query: 'zzzz-no-match' })).toEqual([]);
  });

  it('combines filters with AND', () => {
    const r = filterTasks(rows, { ...NO_FILTERS, criticalOnly: true, layer: 'backend' });
    expect(r.every((x) => x.critical && x.layer === 'backend')).toBe(true);
  });

  it('sorts numerically and stably, in both directions', () => {
    const asc = sortTasks(rows, 'points', 'asc').map((r) => r.points);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = sortTasks(rows, 'hours', 'desc').map((r) => r.hours);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    const byId = sortTasks(rows, 'id', 'asc').map((r) => r.id);
    expect(byId).toEqual([...byId].sort());
    const sprint = sortTasks(rows, 'sprint', 'asc');
    for (let i = 1; i < sprint.length; i++) {
      const a = sprint[i - 1];
      const b = sprint[i];
      if (a && b && a.sprint === b.sprint) expect(a.id < b.id).toBe(true);
    }
  });

  it('does not mutate its input', () => {
    const copy = rows.map((r) => r.id);
    sortTasks(rows, 'title', 'desc');
    expect(rows.map((r) => r.id)).toEqual(copy);
  });
});
