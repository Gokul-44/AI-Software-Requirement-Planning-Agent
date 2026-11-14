import { ConfigSchema, DEFAULT_CONFIG, IDEA_TEXT_MAX, MAX_POINTS } from '@spm/shared';
import type { Config, ConfigPatch } from '../api/types';

export const IDEA_MIN = 10;
export { IDEA_TEXT_MAX as IDEA_MAX };

/** Raw form values. Numbers are kept as strings so the user can clear a field while typing. */
export interface ConfigFormValues {
  team_size: string;
  velocity_points_per_person: string;
  sprint_length_days: string;
  focus_hours_per_day: string;
  pack_mode: Config['pack_mode'];
  points_to_hours: Record<'1' | '2' | '3' | '5' | '8' | '13', string>;
}

export const POINT_KEYS = ['1', '2', '3', '5', '8', '13'] as const;

export function defaultFormValues(): ConfigFormValues {
  const c = DEFAULT_CONFIG;
  return {
    team_size: String(c.team_size),
    velocity_points_per_person: String(c.velocity_points_per_person),
    sprint_length_days: String(c.sprint_length_days),
    focus_hours_per_day: String(c.focus_hours_per_day),
    pack_mode: c.pack_mode,
    points_to_hours: Object.fromEntries(
      POINT_KEYS.map((k) => [k, String(c.points_to_hours[k])]),
    ) as ConfigFormValues['points_to_hours'],
  };
}

export interface ConfigFormResult {
  /** Field key -> message. Keys: a top-level field name or `points_to_hours.<n>`. */
  errors: Record<string, string>;
  /** Capacity per sprint C (points), sprint hours H and the largest estimate in hours. */
  derived: { capacity: number | null; sprintHours: number | null; hours13: number | null };
  invariants: { capacityOk: boolean | null; hoursOk: boolean | null };
  config: Config | null;
  /** Only the values that differ from the defaults, ready for POST /projects. */
  patch: ConfigPatch;
}

const toNumber = (s: string): number => (s.trim() === '' ? Number.NaN : Number(s));

/** Live validation for the config form: field ranges, then the C and H invariants (D-08). */
export function validateConfigForm(v: ConfigFormValues): ConfigFormResult {
  const numeric = {
    team_size: toNumber(v.team_size),
    velocity_points_per_person: toNumber(v.velocity_points_per_person),
    sprint_length_days: toNumber(v.sprint_length_days),
    focus_hours_per_day: toNumber(v.focus_hours_per_day),
    pack_mode: v.pack_mode,
    points_to_hours: Object.fromEntries(POINT_KEYS.map((k) => [k, toNumber(v.points_to_hours[k])])),
  };

  const errors: Record<string, string> = {};
  const parsed = ConfigSchema.safeParse(numeric);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (key === '' || errors[key]) continue;
      const params = (issue as { params?: Record<string, unknown> }).params;
      if (params?.invariant === 'C >= 13') {
        errors[key] =
          `Team size x velocity must be at least ${MAX_POINTS} points (now ${String(params.C)}).`;
      } else if (params?.invariant === 'H >= hours(13)') {
        errors[key] =
          `A sprint (${String(params.H)} h) must fit a 13-point task (${String(params.hours13)} h).`;
      } else if (
        Number.isNaN(Number((numeric as Record<string, unknown>)[key.split('.')[0] ?? '']))
      ) {
        errors[key] = 'Enter a number.';
      } else {
        errors[key] = rangeMessage(issue.message);
      }
    }
  }

  const finite = (n: number) => Number.isFinite(n);
  const capacity =
    finite(numeric.team_size) && finite(numeric.velocity_points_per_person)
      ? numeric.team_size * numeric.velocity_points_per_person
      : null;
  const sprintHours =
    finite(numeric.sprint_length_days) && finite(numeric.focus_hours_per_day)
      ? numeric.sprint_length_days * numeric.focus_hours_per_day
      : null;
  const hours13 = finite(numeric.points_to_hours['13'] ?? Number.NaN)
    ? (numeric.points_to_hours['13'] as number)
    : null;

  const defaults = defaultFormValues();
  const patch: ConfigPatch = {};
  if (parsed.success) {
    const c = parsed.data;
    if (v.team_size !== defaults.team_size) patch.team_size = c.team_size;
    if (v.velocity_points_per_person !== defaults.velocity_points_per_person) {
      patch.velocity_points_per_person = c.velocity_points_per_person;
    }
    if (v.sprint_length_days !== defaults.sprint_length_days) {
      patch.sprint_length_days = c.sprint_length_days;
    }
    if (v.focus_hours_per_day !== defaults.focus_hours_per_day) {
      patch.focus_hours_per_day = c.focus_hours_per_day;
    }
    if (v.pack_mode !== defaults.pack_mode) patch.pack_mode = c.pack_mode;
    const changed = POINT_KEYS.filter((k) => v.points_to_hours[k] !== defaults.points_to_hours[k]);
    if (changed.length > 0) {
      patch.points_to_hours = Object.fromEntries(changed.map((k) => [k, c.points_to_hours[k]]));
    }
  }

  return {
    errors,
    derived: { capacity, sprintHours, hours13 },
    invariants: {
      capacityOk: capacity === null ? null : capacity >= MAX_POINTS,
      hoursOk: sprintHours === null || hours13 === null ? null : sprintHours >= hours13,
    },
    config: parsed.success ? parsed.data : null,
    patch,
  };
}

function rangeMessage(raw: string): string {
  const m = /(?:>=|<=|greater than or equal to|less than or equal to) ?(\d+)/i.exec(raw);
  if (/too small|>=/i.test(raw) && m) return `Must be at least ${m[1]}.`;
  if (/too big|<=/i.test(raw) && m) return `Must be at most ${m[1]}.`;
  if (/integer/i.test(raw)) return 'Must be a whole number.';
  return raw;
}

export function ideaError(text: string): string | null {
  const n = text.trim().length;
  if (n === 0) return null;
  if (n < IDEA_MIN) return `Add a little more detail: at least ${IDEA_MIN} characters (now ${n}).`;
  if (n > IDEA_TEXT_MAX) return `Too long: at most ${IDEA_TEXT_MAX} characters (now ${n}).`;
  return null;
}
