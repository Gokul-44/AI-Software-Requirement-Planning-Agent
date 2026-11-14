import golden from '../../public/golden/food-delivery.json';
import type { Plan } from '../api/types';

/** The golden sample plan the UI is developed against (tests only). */
export function loadGoldenPlan(): Plan {
  return structuredClone(golden) as unknown as Plan;
}
