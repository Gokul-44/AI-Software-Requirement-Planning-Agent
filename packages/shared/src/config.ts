import { z } from 'zod';

/** Message used for every violation of the capacity invariants (D-08, Issue 2). */
export const INVALID_CONFIG = 'INVALID_CONFIG';

/** Largest estimate, in story points. A task of this size must fit in one sprint. */
export const MAX_POINTS = 13;

const hours = () => z.number().int().positive();

const pointsToHoursFields = {
  '1': hours(),
  '2': hours(),
  '3': hours(),
  '5': hours(),
  '8': hours(),
  '13': hours(),
};

const DEFAULT_POINTS_TO_HOURS = { '1': 4, '2': 8, '3': 12, '5': 20, '8': 32, '13': 52 };

export const PointsToHoursSchema = z.strictObject(pointsToHoursFields);
export type PointsToHours = z.infer<typeof PointsToHoursSchema>;

export const PackModeSchema = z.enum(['relaxed', 'strict']);
export type PackMode = z.infer<typeof PackModeSchema>;

const fields = {
  team_size: z.number().int().min(1).max(50),
  velocity_points_per_person: z.number().int().min(1).max(100),
  sprint_length_days: z.number().int().min(1).max(60),
  focus_hours_per_day: z.number().min(1).max(24),
  points_to_hours: PointsToHoursSchema,
  pack_mode: PackModeSchema,
};

/**
 * ConfigSchema with the C6 defaults: `ConfigSchema.parse({})` returns the defaults.
 * Invariants: C = team_size * velocity >= 13 and H = sprint_length_days * focus_hours_per_day
 * >= hours(13). Violations fail with the message INVALID_CONFIG.
 */
export const ConfigSchema = z
  .strictObject({
    team_size: fields.team_size.default(4),
    velocity_points_per_person: fields.velocity_points_per_person.default(10),
    sprint_length_days: fields.sprint_length_days.default(10),
    focus_hours_per_day: fields.focus_hours_per_day.default(6),
    points_to_hours: fields.points_to_hours.default(DEFAULT_POINTS_TO_HOURS),
    pack_mode: fields.pack_mode.default('relaxed'),
  })
  .superRefine((cfg, ctx) => {
    const capacity = cfg.team_size * cfg.velocity_points_per_person;
    if (capacity < MAX_POINTS) {
      ctx.addIssue({
        code: 'custom',
        message: INVALID_CONFIG,
        path: ['velocity_points_per_person'],
        params: { invariant: 'C >= 13', C: capacity },
      });
    }
    const sprintHours = cfg.sprint_length_days * cfg.focus_hours_per_day;
    const largest = cfg.points_to_hours['13'];
    if (sprintHours < largest) {
      ctx.addIssue({
        code: 'custom',
        message: INVALID_CONFIG,
        path: ['focus_hours_per_day'],
        params: { invariant: 'H >= hours(13)', H: sprintHours, hours13: largest },
      });
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

/** Partial overrides accepted by the API (no defaults applied, nothing validated across fields). */
export const ConfigPatchSchema = z.strictObject({
  team_size: fields.team_size.optional(),
  velocity_points_per_person: fields.velocity_points_per_person.optional(),
  sprint_length_days: fields.sprint_length_days.optional(),
  focus_hours_per_day: fields.focus_hours_per_day.optional(),
  points_to_hours: z.strictObject(pointsToHoursFields).partial().optional(),
  pack_mode: PackModeSchema.optional(),
});
export type ConfigPatch = z.infer<typeof ConfigPatchSchema>;

/**
 * Applies a patch over a base config (default: C6 defaults) and validates the result,
 * including the C and H invariants. Returns a Zod SafeParse result.
 */
export function resolveConfig(patch: ConfigPatch = {}, base: Config = DEFAULT_CONFIG) {
  const merged = {
    ...base,
    ...stripUndefined(patch),
    points_to_hours: { ...base.points_to_hours, ...stripUndefined(patch.points_to_hours ?? {}) },
  };
  return ConfigSchema.safeParse(merged);
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
