import { createContext, useContext } from 'react';
import type { Schedule } from '@spm/scheduler';
import type { Plan } from '../../api/types';
import type { PlanIndex } from '../../lib/planIndex';
import type { WhatIfResult, WhatIfSettings } from '../../lib/whatif';

export interface WhatIfState {
  baseline: WhatIfSettings;
  settings: WhatIfSettings;
  setSettings: (next: WhatIfSettings) => void;
  reset: () => void;
  /** True when the sliders differ from the plan's own configuration. */
  active: boolean;
  /** Result of the last run of the scheduler with `settings` (always ok when not active). */
  result: WhatIfResult;
  /** The schedule the Timeline and Sprints tabs draw: the scenario when valid, else the plan's. */
  schedule: Schedule;
  /** True when `schedule` is a what-if scenario rather than the stored plan. */
  isScenario: boolean;
}

export interface PlanContextValue {
  plan: Plan;
  index: PlanIndex;
  whatIf: WhatIfState;
  selectedTaskId: string | null;
  selectTask: (id: string | null) => void;
}

export const PlanContext = createContext<PlanContextValue | null>(null);

export function usePlan(): PlanContextValue {
  const value = useContext(PlanContext);
  if (!value) throw new Error('usePlan must be used inside the plan page.');
  return value;
}
