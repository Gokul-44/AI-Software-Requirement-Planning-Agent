import { schedulePlan } from '@spm/scheduler';
import type { Schedule } from '@spm/scheduler';
import { resolveConfig } from '@spm/shared';
import type { Config, Plan } from '../api/types';

/** The three knobs of the what-if panel (design document B6 row 7). */
export interface WhatIfSettings {
  team_size: number;
  velocity_points_per_person: number;
  pack_mode: Config['pack_mode'];
}

export type WhatIfResult =
  | {
      ok: true;
      config: Config;
      schedule: Schedule;
      sprintCount: number;
      capacityDays: number;
      capacityPoints: number;
    }
  | { ok: false; reasons: string[] };

export function settingsFromPlan(plan: Plan): WhatIfSettings {
  const c = plan.run.config;
  return {
    team_size: c.team_size,
    velocity_points_per_person: c.velocity_points_per_person,
    pack_mode: c.pack_mode,
  };
}

export function sameSettings(a: WhatIfSettings, b: WhatIfSettings): boolean {
  return (
    a.team_size === b.team_size &&
    a.velocity_points_per_person === b.velocity_points_per_person &&
    a.pack_mode === b.pack_mode
  );
}

/**
 * Re-schedules the plan in the browser with the same pure code the server uses. Dependencies and
 * estimates stay as they are; only capacity and the packing mode change. CPM is independent of
 * the team, so it does not move; sprints, utilisation and the capacity-feasible duration do.
 */
export function runWhatIf(plan: Plan, settings: WhatIfSettings): WhatIfResult {
  const checked = resolveConfig(settings, plan.run.config);
  if (!checked.success) {
    const reasons = checked.error.issues.map((issue) => {
      const params = (issue as { params?: Record<string, unknown> }).params;
      if (params?.invariant === 'C >= 13') {
        return `Capacity per sprint is ${String(params.C)} points (team size x velocity); the largest task is 13 points, so it must be at least 13.`;
      }
      if (params?.invariant === 'H >= hours(13)') {
        return `A sprint holds ${String(params.H)} focus hours but a 13-point task needs ${String(params.hours13)}.`;
      }
      return issue.message;
    });
    return { ok: false, reasons };
  }
  const config = checked.data;
  try {
    const result = schedulePlan(plan, config);
    if (!result.ok) {
      return {
        ok: false,
        reasons: ['The dependency graph contains a cycle, so it cannot be scheduled.'],
      };
    }
    return {
      ok: true,
      config,
      schedule: result.schedule,
      sprintCount: result.schedule.capacity_plan.sprint_count,
      capacityDays: result.schedule.capacity_plan.duration_days,
      capacityPoints: result.schedule.capacity_plan.capacity_points_per_sprint,
    };
  } catch (e) {
    return { ok: false, reasons: [e instanceof Error ? e.message : 'Scheduling failed.'] };
  }
}
