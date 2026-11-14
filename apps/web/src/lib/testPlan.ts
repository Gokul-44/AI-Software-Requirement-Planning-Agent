import fixture from '../../../../fixtures/test-plan.food-delivery.json';
import type { Plan } from '../api/types';

/** The hand-written test fixture plan (fixtures/test-plan.food-delivery.json), for tests only. */
export function loadGoldenPlan(): Plan {
  return structuredClone(fixture) as unknown as Plan;
}
