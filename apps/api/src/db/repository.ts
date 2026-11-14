import type {
  Config,
  CycleInfo,
  IssueKind,
  Layer,
  Plan,
  Points,
  Priority,
  RequirementCategory,
  RequirementType,
  StageError,
  StageStatus,
} from '@spm/shared';
import type { StageCacheStore } from '../llm/cache.js';

/** Number of stages tracked per run (MASTER_PLAN C2: stage_executions.stage 1..8). */
export const STAGE_COUNT = 8;

export type RunStatusValue = 'queued' | 'running' | 'needs_resolution' | 'succeeded' | 'failed';

export interface RunRow {
  id: string;
  projectId: string;
  parentRunId: string | null;
  ideaText: string;
  projectCreatedAt: Date;
  isGolden: boolean;
  /** Set while the run waits in `needs_resolution`. */
  cycle: CycleInfo | null;
  status: RunStatusValue;
  currentStage: number;
  config: Config;
  llmProvider: string;
  llmModel: string;
  promptVersions: Record<string, string>;
  summary: string | null;
  assumptions: string[];
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  error: StageError | null;
  plan: unknown;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface StageRow {
  stage: number;
  status: StageStatus;
  cacheKey: string | null;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number | null;
  error: unknown;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface ProjectListRow {
  id: string;
  ideaText: string;
  createdAt: Date;
  latestRun: { id: string; status: RunStatusValue } | null;
}

export interface RequirementRow {
  code: string;
  type: RequirementType;
  category: RequirementCategory | null;
  text: string;
  priority: Priority;
}
export interface EpicRow {
  code: string;
  title: string;
  description: string;
}
export interface StoryRow {
  code: string;
  epicCode: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: string[];
  priority: Priority;
  requirementCodes: string[];
}
export interface TaskRow {
  code: string;
  storyCode: string;
  title: string;
  description: string;
  layer: Layer;
  /** Filled by stage 4 (null or absent before). */
  points?: Points | null;
  hours?: number | null;
  rationale?: string | null;
}
export interface EstimateRow {
  code: string;
  points: Points;
  hours: number;
  rationale: string;
}
export interface DependencyRow {
  from: string;
  to: string;
  source: 'llm' | 'repair' | 'user';
  reason: string | null;
}
export interface IssueDraft {
  stage: number;
  severity: 'error' | 'warning' | 'info';
  kind: IssueKind;
  message: string;
  refs: string[];
  resolution: string | null;
}
export interface IssueRow extends IssueDraft {
  code: string;
}

export interface NewRunInput {
  ideaText: string;
  config: Config;
  llmProvider: string;
  llmModel: string;
  promptVersions: Record<string, string>;
}

/** A new run inside an existing project (a re-run), linked to the run it came from. */
export interface RerunInput extends Omit<NewRunInput, 'ideaText'> {
  projectId: string;
  parentRunId: string;
}

export interface GoldenRunRow {
  runId: string;
  ideaText: string;
}

export interface RunPatch {
  status?: RunStatusValue;
  currentStage?: number;
  summary?: string | null;
  assumptions?: string[];
  inputTokens?: number;
  outputTokens?: number;
  error?: StageError | null;
  plan?: unknown;
  cycle?: CycleInfo | null;
  finishedAt?: Date | null;
}

export interface StagePatch {
  status?: StageStatus;
  cacheKey?: string | null;
  attempts?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number | null;
  error?: unknown;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

/**
 * Thin persistence layer. SQL lives in `pg-repository.ts`; `memory-repository.ts` has the same
 * behaviour for tests and offline work. Entity writes replace the run's rows for that stage, so a
 * stage can be re-executed safely.
 */
export interface Repository {
  readonly cache: StageCacheStore;
  ping(): Promise<void>;
  createProjectWithRun(input: NewRunInput): Promise<{ projectId: string; runId: string }>;
  /** Creates a run in an existing project, with all eight stage rows pending. */
  createRerun(input: RerunInput): Promise<string>;
  getRun(runId: string): Promise<RunRow | null>;
  updateRun(runId: string, patch: RunPatch): Promise<void>;
  getStages(runId: string): Promise<StageRow[]>;
  updateStage(runId: string, stage: number, patch: StagePatch): Promise<void>;
  countIssuesBySeverity(runId: string): Promise<{ error: number; warning: number }>;
  listProjects(limit: number): Promise<ProjectListRow[]>;
  countRunsSince(since: Date): Promise<number>;
  /** Startup recovery: queued/running runs become failed with reason INTERRUPTED. */
  markInterruptedRuns(): Promise<string[]>;
  saveRequirements(runId: string, rows: RequirementRow[]): Promise<void>;
  saveStoryTree(runId: string, epics: EpicRow[], stories: StoryRow[]): Promise<void>;
  saveTasks(runId: string, rows: TaskRow[]): Promise<void>;
  /** Stage 4: writes points, hours and rationale onto the run's existing tasks. */
  saveEstimates(runId: string, rows: EstimateRow[]): Promise<void>;
  /** Stage 5: replaces the run's dependency edges. */
  saveDependencies(runId: string, rows: DependencyRow[]): Promise<void>;
  /**
   * Stage 8: replaces every normalised row of the run (requirements ... plan_issues) from the
   * assembled plan, sets the runs.plan snapshot and marks the run succeeded, all in ONE
   * transaction. A reader never sees a succeeded run without its plan.
   */
  savePlan(runId: string, plan: Plan): Promise<void>;
  /**
   * Re-run support: copies what stages 1..`uptoStage` produced (and the run summary) from one
   * run into another, so those stages need no LLM call and keep user decisions.
   */
  cloneRunData(fromRunId: string, toRunId: string, uptoStage: number): Promise<void>;
  listGoldenRuns(): Promise<GoldenRunRow[]>;
  markGolden(runId: string): Promise<void>;
  /** Deletes the run's issues of `stage` and later, then inserts `issues` (codes continue I-001...). */
  replaceIssuesFromStage(runId: string, stage: number, issues: IssueDraft[]): Promise<void>;
  loadCore(runId: string): Promise<{
    requirements: RequirementRow[];
    epics: EpicRow[];
    stories: StoryRow[];
    tasks: TaskRow[];
    dependencies: DependencyRow[];
    issues: IssueRow[];
  }>;
}

export const issueCode = (n: number) => `I-${String(n).padStart(3, '0')}`;

export const INTERRUPTED_ERROR = (stage: number): StageError => ({
  stage: Math.min(Math.max(stage, 1), STAGE_COUNT),
  code: 'STAGE_FAILED',
  message: 'The run was interrupted by a server restart.',
  details: { reason: 'INTERRUPTED' },
});
