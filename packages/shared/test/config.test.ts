import { describe, expect, it } from 'vitest';
import { ConfigSchema, DEFAULT_CONFIG, INVALID_CONFIG, resolveConfig } from '../src/index.js';

describe('ConfigSchema', () => {
  it('applies the C6 defaults', () => {
    expect(ConfigSchema.parse({})).toEqual({
      team_size: 4,
      velocity_points_per_person: 10,
      sprint_length_days: 10,
      focus_hours_per_day: 6,
      points_to_hours: { '1': 4, '2': 8, '3': 12, '5': 20, '8': 32, '13': 52 },
      pack_mode: 'relaxed',
    });
    expect(DEFAULT_CONFIG.team_size * DEFAULT_CONFIG.velocity_points_per_person).toBe(40);
  });

  it('accepts the boundary C = 13 and H = hours(13)', () => {
    expect(ConfigSchema.safeParse({ team_size: 1, velocity_points_per_person: 13 }).success).toBe(
      true,
    );
    // H = 13 days * 4 h = 52 = hours(13)
    expect(ConfigSchema.safeParse({ sprint_length_days: 13, focus_hours_per_day: 4 }).success).toBe(
      true,
    );
  });

  it('fails with INVALID_CONFIG when C < 13', () => {
    const r = ConfigSchema.safeParse({ team_size: 1, velocity_points_per_person: 12 });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain(INVALID_CONFIG);
  });

  it('fails with INVALID_CONFIG when H < hours(13)', () => {
    const r = ConfigSchema.safeParse({ sprint_length_days: 5, focus_hours_per_day: 6 }); // H = 30
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain(INVALID_CONFIG);
  });

  it('uses the configured hours(13), not a constant', () => {
    const r = ConfigSchema.safeParse({
      points_to_hours: { '1': 4, '2': 8, '3': 12, '5': 20, '8': 32, '13': 80 },
    });
    expect(r.success).toBe(false); // H = 60 < 80
  });

  it('rejects bad types, unknown keys and a bad pack_mode', () => {
    expect(ConfigSchema.safeParse({ team_size: 'four' }).success).toBe(false);
    expect(ConfigSchema.safeParse({ team_size: 0 }).success).toBe(false);
    expect(ConfigSchema.safeParse({ colour: 'red' }).success).toBe(false);
    expect(ConfigSchema.safeParse({ pack_mode: 'greedy' }).success).toBe(false);
  });
});

describe('resolveConfig', () => {
  it('merges a partial patch over the defaults', () => {
    const r = resolveConfig({ team_size: 6, points_to_hours: { '13': 48 } });
    expect(r.success).toBe(true);
    expect(r.data?.team_size).toBe(6);
    expect(r.data?.points_to_hours).toEqual({
      '1': 4,
      '2': 8,
      '3': 12,
      '5': 20,
      '8': 32,
      '13': 48,
    });
  });
  it('still enforces the invariants after merging', () => {
    const r = resolveConfig({ team_size: 1, velocity_points_per_person: 5 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(INVALID_CONFIG);
  });
});
