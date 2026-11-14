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
