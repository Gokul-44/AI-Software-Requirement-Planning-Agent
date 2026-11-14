import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Plan } from '../../api/types';
import { buildPlanIndex } from '../../lib/planIndex';
import { runWhatIf, sameSettings, settingsFromPlan } from '../../lib/whatif';
import type { WhatIfSettings } from '../../lib/whatif';
import { PlanContext } from './context';
import type { PlanContextValue } from './context';

/** Holds the derived indexes, the what-if scenario and the selected task for all plan tabs. */
export function PlanProvider({ plan, children }: { plan: Plan; children: ReactNode }) {
  const index = useMemo(() => buildPlanIndex(plan), [plan]);
  const baseline = useMemo(() => settingsFromPlan(plan), [plan]);
  const [settings, setSettings] = useState<WhatIfSettings>(baseline);
  const [params, setParams] = useSearchParams();

  const active = !sameSettings(settings, baseline);
  const result = useMemo(() => runWhatIf(plan, settings), [plan, settings]);
  const reset = useCallback(() => setSettings(baseline), [baseline]);

  const selectedTaskId = params.get('task');
  const selectTask = useCallback(
    (id: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('task', id);
          else next.delete('task');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const value = useMemo<PlanContextValue>(() => {
    const scenarioOk = active && result.ok;
    return {
      plan,
      index,
      selectedTaskId: selectedTaskId && index.tasks.has(selectedTaskId) ? selectedTaskId : null,
      selectTask,
      whatIf: {
        baseline,
        settings,
        setSettings,
        reset,
        active,
        result,
        schedule: scenarioOk && result.ok ? result.schedule : plan.schedule,
        isScenario: scenarioOk,
      },
    };
  }, [plan, index, selectedTaskId, selectTask, baseline, settings, reset, active, result]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}
