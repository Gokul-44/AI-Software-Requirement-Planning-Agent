import { describe, expect, it } from 'vitest';
import { defaultFormValues, ideaError, validateConfigForm } from './configForm';

describe('validateConfigForm', () => {
  it('accepts the defaults and sends an empty patch', () => {
    const r = validateConfigForm(defaultFormValues());
    expect(r.errors).toEqual({});
    expect(r.config).not.toBeNull();
    expect(r.patch).toEqual({});
    expect(r.derived).toEqual({ capacity: 40, sprintHours: 60, hours13: 52 });
    expect(r.invariants).toEqual({ capacityOk: true, hoursOk: true });
  });

  it('sends only the changed fields', () => {
    const r = validateConfigForm({ ...defaultFormValues(), team_size: '6', pack_mode: 'strict' });
    expect(r.errors).toEqual({});
    expect(r.patch).toEqual({ team_size: 6, pack_mode: 'strict' });
  });

  it('flags C < 13 live', () => {
    const r = validateConfigForm({
      ...defaultFormValues(),
      team_size: '1',
      velocity_points_per_person: '5',
    });
    expect(r.invariants.capacityOk).toBe(false);
    expect(Object.values(r.errors).join(' ')).toMatch(/at least 13/);
    expect(r.config).toBeNull();
    expect(r.patch).toEqual({});
  });

  it('flags H < hours(13) live', () => {
    const r = validateConfigForm({
      ...defaultFormValues(),
      sprint_length_days: '5',
      focus_hours_per_day: '4',
    });
    expect(r.invariants.hoursOk).toBe(false);
    expect(r.errors.focus_hours_per_day).toMatch(/must fit a 13-point task/);
  });

  it('handles empty, out-of-range and fractional numbers', () => {
    const empty = validateConfigForm({ ...defaultFormValues(), team_size: '' });
    expect(empty.errors.team_size).toBeTruthy();
    expect(empty.config).toBeNull();
    const big = validateConfigForm({ ...defaultFormValues(), team_size: '500' });
    expect(big.errors.team_size).toBeTruthy();
    const frac = validateConfigForm({ ...defaultFormValues(), team_size: '2.5' });
    expect(frac.errors.team_size).toBeTruthy();
  });
});

describe('ideaError', () => {
  it('enforces 10 to 2000 characters after trimming', () => {
    expect(ideaError('')).toBeNull();
    expect(ideaError('   short  ')).toMatch(/at least 10/);
    expect(ideaError('a'.repeat(10))).toBeNull();
    expect(ideaError('a'.repeat(2000))).toBeNull();
    expect(ideaError('a'.repeat(2001))).toMatch(/at most 2000/);
  });
});
