import { describe, expect, it } from 'vitest';
import { CAPACITY_BOUND_RATIO, capacityRatio, formatRatio, formatSignalNumber } from './format';

describe('capacityRatio', () => {
  it('is computed from hours, so the real food-delivery numbers give 1.55x everywhere', () => {
    // 3 sprints x 60 h = 180 h against a CPM of 116 h. From rounded days it would be 30 / 19.5 = 1.54.
    const ratio = capacityRatio({ sprint_count: 3, hours_per_sprint: 60 }, 116);
    expect(ratio).toBeCloseTo(1.5517, 4);
    expect(formatRatio(ratio as number)).toBe('1.55×');
  });

  it('agrees with the capacity_bound threshold exactly', () => {
    const atThreshold = capacityRatio({ sprint_count: 3, hours_per_sprint: 60 }, 120);
    expect(atThreshold).toBe(CAPACITY_BOUND_RATIO);
    expect(capacityRatio({ sprint_count: 3, hours_per_sprint: 60 }, 0)).toBeNull();
  });
});

describe('formatSignalNumber (Risks tab)', () => {
  it('shows share signals as whole percentages that match the message wording', () => {
    expect(formatSignalNumber('sprint_overload', 0.97)).toBe('97%');
    expect(formatSignalNumber('sprint_overload', 0.975)).toBe('98%');
    expect(formatSignalNumber('sprint_overload', 0.98)).toBe('98%');
    expect(formatSignalNumber('critical_path_length', 0.17)).toBe('17%');
    expect(formatSignalNumber('critical_layer_concentration', 0.83)).toBe('83%');
    expect(formatSignalNumber('critical_layer_concentration', 0.6)).toBe('60%');
    expect(formatSignalNumber('layer_imbalance', 0.0645, { threshold: 0.1 })).toBe('6%');
    expect(formatSignalNumber('layer_imbalance', 0.1, { threshold: 0.1 })).toBe('10%');
  });

  it('shows the capacity ratio as 1.55x', () => {
    expect(formatSignalNumber('capacity_bound', 1.5517)).toBe('1.55×');
    expect(formatSignalNumber('capacity_bound', 1.5)).toBe('1.50×');
  });

  it('leaves counts and other measures as plain numbers', () => {
    expect(formatSignalNumber('high_fan_in', 4)).toBe('4');
    expect(formatSignalNumber('critical_high_fanout', 5)).toBe('5');
    expect(formatSignalNumber('sprint_imbalance', 0.6667)).toBe('0.67');
    expect(formatSignalNumber('duplicate_task_suspect', 0.85)).toBe('0.85');
    // layer_imbalance "no devops tasks": a count (0 of 1), not a share.
    expect(formatSignalNumber('layer_imbalance', 0, { threshold: 1 })).toBe('0');
  });
});
