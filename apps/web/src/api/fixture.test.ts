import { describe, expect, it } from 'vitest';
import { STAGE_NAMES, simulateRunStatus } from './fixture';
import type { SimRun } from './fixture';

const sim: SimRun = {
  runId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  idea: 'An example idea for the simulated run',
  startedAt: 1_000,
  planId: '33333333-3333-4333-8333-333333333333',
};

describe('simulated run', () => {
  it('has the 8 stages of the pipeline', () => {
    expect(STAGE_NAMES).toHaveLength(8);
  });

  it('starts with stage 1 running and the rest pending', () => {
    const s = simulateRunStatus(sim, 1_100);
    expect(s.status).toBe('running');
    expect(s.current_stage).toBe(1);
    expect(s.stages.map((x) => x.status)).toEqual(['running', ...Array<string>(7).fill('pending')]);
  });

  it('moves through the stages and finishes with every stage succeeded', () => {
    const mid = simulateRunStatus(sim, 1_000 + 5_000);
    expect(mid.status).toBe('running');
    expect(mid.current_stage).toBeGreaterThan(1);
    const done = simulateRunStatus(sim, 1_000 + 60_000);
    expect(done.status).toBe('succeeded');
    expect(done.current_stage).toBe(8);
    expect(done.stages.every((x) => x.status === 'succeeded')).toBe(true);
    expect(done.stages.every((x) => (x.attempts ?? 0) >= 1 && (x.latency_ms ?? 0) > 0)).toBe(true);
  });
});

describe('simulated cycle, failure and re-run', () => {
  const cycle = {
    task_ids: ['T-003', 'T-004', 'T-005'],
    edges: [
      { from: 'T-003', to: 'T-004' },
      { from: 'T-004', to: 'T-005' },
      { from: 'T-005', to: 'T-003' },
    ],
  };

  it('waits in needs_resolution at stage 5 until the cycle is resolved', () => {
    const waiting = simulateRunStatus({ ...sim, mode: 'cycle', cycle }, 1_000 + 60_000);
    expect(waiting.status).toBe('needs_resolution');
    expect(waiting.cycle).toEqual(cycle);
    expect(waiting.stages[4]?.status).toBe('running');
    expect(waiting.stages[5]?.status).toBe('pending');

    const resolved = simulateRunStatus(
      { ...sim, mode: 'cycle', cycle, resolvedAt: 1_000 + 20_000 },
      1_000 + 80_000,
    );
    expect(resolved.status).toBe('succeeded');
    expect(resolved.cycle).toBeNull();
  });

  it('fails at stage 3 with a STAGE_FAILED error', () => {
    const failed = simulateRunStatus({ ...sim, mode: 'fail' }, 1_000 + 60_000);
    expect(failed.status).toBe('failed');
    expect(failed.error?.code).toBe('STAGE_FAILED');
    expect(failed.stages[2]?.status).toBe('failed');
  });

  it('a re-run from stage 6 reuses stages 1-5', () => {
    const s = simulateRunStatus({ ...sim, fromStage: 6 }, 1_000 + 100);
    expect(s.stages.slice(0, 5).every((x) => x.status === 'cached')).toBe(true);
    expect(s.stages[5]?.status).toBe('running');
    expect(simulateRunStatus({ ...sim, fromStage: 6 }, 1_000 + 30_000).status).toBe('succeeded');
  });
});
