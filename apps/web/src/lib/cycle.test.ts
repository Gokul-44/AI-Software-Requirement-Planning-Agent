import { describe, expect, it } from 'vitest';
import { cycleComponents, edgeKey, layoutCycle, stillCyclic } from './cycle';

const cycle = {
  task_ids: ['T-001', 'T-002', 'T-003', 'T-010', 'T-011'],
  edges: [
    { from: 'T-001', to: 'T-002' },
    { from: 'T-002', to: 'T-003' },
    { from: 'T-003', to: 'T-001' },
    { from: 'T-010', to: 'T-011' },
    { from: 'T-011', to: 'T-010' },
  ],
};

describe('cycle helpers', () => {
  it('splits separate loops into components', () => {
    const groups = cycleComponents(cycle).map((g) => g.sort());
    expect(groups).toHaveLength(2);
    expect(groups).toContainEqual(['T-001', 'T-002', 'T-003']);
    expect(groups).toContainEqual(['T-010', 'T-011']);
  });

  it('knows whether removing edges breaks every loop', () => {
    expect(stillCyclic(cycle.edges, new Set())).toBe(true);
    expect(stillCyclic(cycle.edges, new Set([edgeKey(cycle.edges[0]!)]))).toBe(true);
    expect(
      stillCyclic(cycle.edges, new Set([edgeKey(cycle.edges[0]!), edgeKey(cycle.edges[3]!)])),
    ).toBe(false);
  });

  it('lays out every task once, inside the box', () => {
    const layout = layoutCycle(cycle);
    expect(layout.nodes.map((n) => n.id).sort()).toEqual([...cycle.task_ids].sort());
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(layout.width);
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(layout.height);
    }
  });
});
