import { randomUUID } from 'node:crypto';
import type { StageCacheEntry } from '../llm/cache.js';
import { INTERRUPTED_ERROR, STAGE_COUNT, issueCode } from './repository.js';
import type {
  EpicRow,
  IssueDraft,
  IssueRow,
  NewRunInput,
  ProjectListRow,
  RequirementRow,
  Repository,
  RunPatch,
  RunRow,
  StagePatch,
  StageRow,
  StoryRow,
  TaskRow,
} from './repository.js';

interface RunRecord extends RunRow {
  stages: StageRow[];
  requirements: RequirementRow[];
  epics: EpicRow[];
  stories: StoryRow[];
  tasks: TaskRow[];
  issues: IssueRow[];
}

/** In-memory Repository with the same behaviour as PgRepository. Used by tests and offline work. */
export class MemoryRepository implements Repository {
  private readonly runs = new Map<string, RunRecord>();
  private readonly projects = new Map<string, { id: string; ideaText: string; createdAt: Date }>();
  private readonly cacheMap = new Map<string, StageCacheEntry>();

  readonly cache = {
    get: (key: string) => Promise.resolve(this.cacheMap.get(key) ?? null),
    put: (entry: StageCacheEntry) => {
      if (!this.cacheMap.has(entry.cacheKey))
        this.cacheMap.set(entry.cacheKey, structuredClone(entry));
      return Promise.resolve();
    },
  };

  ping(): Promise<void> {
    return Promise.resolve();
  }

  createProjectWithRun(input: NewRunInput): Promise<{ projectId: string; runId: string }> {
    const projectId = randomUUID();
    const runId = randomUUID();
    const now = new Date();
    this.projects.set(projectId, { id: projectId, ideaText: input.ideaText, createdAt: now });
    this.runs.set(runId, {
      id: runId,
      projectId,
      ideaText: input.ideaText,
      status: 'queued',
      currentStage: 0,
      config: structuredClone(input.config),
      llmProvider: input.llmProvider,
      llmModel: input.llmModel,
      promptVersions: { ...input.promptVersions },
      summary: null,
      assumptions: [],
      inputTokens: 0,
      outputTokens: 0,
      estCostUsd: 0,
      error: null,
      plan: null,
      createdAt: now,
      finishedAt: null,
      stages: Array.from({ length: STAGE_COUNT }, (_, i) => ({
        stage: i + 1,
        status: 'pending',
        cacheKey: null,
        attempts: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: null,
        error: null,
        startedAt: null,
        finishedAt: null,
      })),
      requirements: [],
      epics: [],
      stories: [],
      tasks: [],
      issues: [],
    });
    return Promise.resolve({ projectId, runId });
  }

  private record(runId: string): RunRecord {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`Unknown run ${runId}`);
    return r;
  }

  getRun(runId: string): Promise<RunRow | null> {
    const r = this.runs.get(runId);
    if (!r) return Promise.resolve(null);
    const row: Partial<RunRecord> = { ...r };
    for (const key of ['stages', 'requirements', 'epics', 'stories', 'tasks', 'issues'] as const) {
      delete row[key];
    }
    return Promise.resolve(structuredClone(row as RunRow));
  }

  updateRun(runId: string, patch: RunPatch): Promise<void> {
    Object.assign(this.record(runId), stripUndefined(patch));
    return Promise.resolve();
  }

  getStages(runId: string): Promise<StageRow[]> {
    return Promise.resolve(structuredClone(this.record(runId).stages));
  }

  updateStage(runId: string, stage: number, patch: StagePatch): Promise<void> {
    const row = this.record(runId).stages.find((s) => s.stage === stage);
    if (row) Object.assign(row, stripUndefined(patch));
    return Promise.resolve();
  }

  countIssuesBySeverity(runId: string): Promise<{ error: number; warning: number }> {
    const issues = this.record(runId).issues;
    return Promise.resolve({
      error: issues.filter((i) => i.severity === 'error').length,
      warning: issues.filter((i) => i.severity === 'warning').length,
    });
  }

  listProjects(limit: number): Promise<ProjectListRow[]> {
    const rows = [...this.projects.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((p) => {
        const latest = [...this.runs.values()]
          .filter((r) => r.projectId === p.id)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        return {
          id: p.id,
          ideaText: p.ideaText,
          createdAt: p.createdAt,
          latestRun: latest ? { id: latest.id, status: latest.status } : null,
        };
      });
    return Promise.resolve(rows);
  }

  countRunsSince(since: Date): Promise<number> {
    return Promise.resolve([...this.runs.values()].filter((r) => r.createdAt >= since).length);
  }

  markInterruptedRuns(): Promise<string[]> {
    const ids: string[] = [];
    for (const run of this.runs.values()) {
      if (run.status !== 'queued' && run.status !== 'running') continue;
      run.status = 'failed';
      run.finishedAt = new Date();
      run.error = INTERRUPTED_ERROR(run.currentStage);
      for (const s of run.stages) {
        if (s.status === 'running') {
          s.status = 'failed';
          s.error = { reason: 'INTERRUPTED' };
          s.finishedAt = new Date();
        }
      }
      ids.push(run.id);
    }
    return Promise.resolve(ids);
  }

  saveRequirements(runId: string, rows: RequirementRow[]): Promise<void> {
    this.record(runId).requirements = structuredClone(rows);
    return Promise.resolve();
  }

  saveStoryTree(runId: string, epics: EpicRow[], stories: StoryRow[]): Promise<void> {
    const r = this.record(runId);
    r.epics = structuredClone(epics);
    r.stories = structuredClone(stories);
    r.tasks = []; // cascade, as in Postgres
    return Promise.resolve();
  }

  saveTasks(runId: string, rows: TaskRow[]): Promise<void> {
    this.record(runId).tasks = structuredClone(rows);
    return Promise.resolve();
  }

  replaceIssuesFromStage(runId: string, stage: number, issues: IssueDraft[]): Promise<void> {
    const r = this.record(runId);
    r.issues = r.issues.filter((i) => i.stage < stage);
    let next = r.issues.reduce((max, i) => Math.max(max, Number(i.code.slice(2))), 0);
    for (const i of issues) r.issues.push({ ...structuredClone(i), code: issueCode(++next) });
    return Promise.resolve();
  }

  loadCore(runId: string) {
    const r = this.record(runId);
    return Promise.resolve(
      structuredClone({
        requirements: r.requirements,
        epics: r.epics,
        stories: r.stories,
        tasks: r.tasks,
        issues: r.issues,
      }),
    );
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
