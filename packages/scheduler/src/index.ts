/**
 * @spm/scheduler: pure, synchronous scheduling algorithms (no I/O). "AI generates,
 * algorithms verify": edge validation, cycle reporting, CPM, sprint packing and risk signals.
 * Call `schedulePlan` from the API and from the browser.
 */
export { OversizedTaskError, CycleError } from './errors.js';
export type { OversizeKind } from './errors.js';
export { validateEdges } from './validate.js';
export { checkAcyclic, descendantCounts } from './graph.js';
export type { AcyclicResult } from './graph.js';
export { computeCpm, criticalPath } from './cpm.js';
export { priorityOrder } from './priority.js';
export { packSprints } from './pack.js';
export {
  requirementsWithoutStory,
  requirementsWithoutTask,
  storiesWithoutTasks,
  computeCoverage,
} from './coverage.js';
export {
  DEFAULT_DUPLICATE_SIMILARITY,
  findDuplicateTitles,
  jaccard,
  normaliseTitle,
  titleSimilarity,
} from './similarity.js';
export type { DuplicatePair } from './similarity.js';
export {
  DEFAULT_THRESHOLDS,
  DEPLOY_TITLE,
  MAX_DUPLICATE_SIGNALS,
  MAX_SIGNALS,
  computeSignals,
} from './signals.js';
export type { Thresholds } from './signals.js';
export { schedulePlan } from './schedule.js';
export type { SchedulePlanResult } from './schedule.js';
export type {
  Coverage,
  CpmResult,
  CpmTask,
  Edge,
  PackConfig,
  PackMode,
  PackResult,
  PackedSprint,
  PackedTask,
  PlanCore,
  Schedule,
  ScheduledPlanCore,
  TaskInput,
} from './types.js';
