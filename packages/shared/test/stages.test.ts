import { describe, expect, it } from 'vitest';
import {
  DependenciesOutputSchema,
  EstimatesOutputSchema,
  RequirementsOutputSchema,
  RisksOutputSchema,
  StoriesOutputSchema,
  TasksOutputSchema,
  checkMergedTaskCount,
  diffEstimateIds,
  makeEstimatesOutputSchema,
  makeRisksOutputSchema,
  makeStoriesOutputSchema,
  makeTasksOutputSchema,
} from '../src/index.js';
import {
  validDependenciesOutput,
  validEstimatesOutput,
  validRequirementsOutput,
  validRisksOutput,
  validStoriesOutput,
  validTasksOutput,
} from './fixtures.js';

describe('stage 1: RequirementsOutput', () => {
  it('accepts a valid example', () => {
    expect(RequirementsOutputSchema.safeParse(validRequirementsOutput()).success).toBe(true);
  });
  it('rejects a missing field', () => {
    const x: Record<string, unknown> = validRequirementsOutput();
    delete x.summary;
    expect(RequirementsOutputSchema.safeParse(x).success).toBe(false);
  });
  it('rejects a bad enum', () => {
    const x = validRequirementsOutput();
    (x.requirements[0] as { priority: string }).priority = 'urgent';
    expect(RequirementsOutputSchema.safeParse(x).success).toBe(false);
  });
  it('rejects unknown properties', () => {
    const x = { ...validRequirementsOutput(), extra: 1 };
    expect(RequirementsOutputSchema.safeParse(x).success).toBe(false);
  });
  it('rejects fewer than 5 requirements', () => {
    const x = validRequirementsOutput();
    x.requirements = x.requirements.slice(0, 4);
    expect(RequirementsOutputSchema.safeParse(x).success).toBe(false);
  });
  it('rejects when no requirement is non_functional', () => {
    const x = validRequirementsOutput();
    x.requirements = x.requirements.map((r) => ({
      type: 'functional',
      text: r.text,
      priority: r.priority,
    }));
    expect(RequirementsOutputSchema.safeParse(x).success).toBe(false);
  });
  it('requires category on non_functional requirements', () => {
    const x = validRequirementsOutput();
    const nf = x.requirements[4] as { category?: string };
    delete nf.category;
    const r = RequirementsOutputSchema.safeParse(x);
    expect(r.success).toBe(false);
  });
});

describe('stage 2: StoriesOutput', () => {
  it('accepts a valid example', () => {
    expect(StoriesOutputSchema.safeParse(validStoriesOutput()).success).toBe(true);
  });
  it('rejects a bad requirement id pattern', () => {
    const x = validStoriesOutput();
    (x.epics[0]!.stories[0] as { requirement_ids: string[] }).requirement_ids = ['R-1'];
    expect(StoriesOutputSchema.safeParse(x).success).toBe(false);
  });
  it('rejects a missing acceptance_criteria field', () => {
    const x = validStoriesOutput();
    delete (x.epics[0]!.stories[0] as { acceptance_criteria?: unknown }).acceptance_criteria;
    expect(StoriesOutputSchema.safeParse(x).success).toBe(false);
  });
  it('rejects more than 40 stories in total', () => {
    const x = validStoriesOutput();
    const story = x.epics[0]!.stories[0]!;
    x.epics = Array.from({ length: 6 }, (_, i) => ({
      title: `Epic ${i}`,
      description: 'd',
      stories: Array.from({ length: 7 }, () => ({ ...story })),
    }));
    expect(StoriesOutputSchema.safeParse(x).success).toBe(false); // 42 stories
  });
  it('rejects requirement ids outside the stamped set', () => {
    const schema = makeStoriesOutputSchema({ requirementIds: ['R-001', 'R-002'] });
    expect(schema.safeParse(validStoriesOutput()).success).toBe(false); // uses R-003
    const ok = makeStoriesOutputSchema({ requirementIds: ['R-001', 'R-002', 'R-003'] });
    expect(ok.safeParse(validStoriesOutput()).success).toBe(true);
  });
});

describe('stage 3: TasksOutput', () => {
  it('accepts a valid example', () => {
    expect(TasksOutputSchema.safeParse(validTasksOutput()).success).toBe(true);
  });
  it('rejects a bad layer enum', () => {
    const x = validTasksOutput();
    (x.tasks[0] as { layer: string }).layer = 'mobile';
    expect(TasksOutputSchema.safeParse(x).success).toBe(false);
  });
  it('rejects a bad story id pattern', () => {
    const x = validTasksOutput();
    x.tasks[0]!.story_id = 'S-1';
    expect(TasksOutputSchema.safeParse(x).success).toBe(false);
  });
  it('rejects more than 8 tasks for one story', () => {
    const x = { tasks: Array.from({ length: 9 }, () => ({ ...validTasksOutput().tasks[0]! })) };
    expect(TasksOutputSchema.safeParse(x).success).toBe(false);
  });
  it('rejects story ids outside the batch and stories with no tasks', () => {
    const unknown = makeTasksOutputSchema({ storyIds: ['S-001'] });
    expect(unknown.safeParse(validTasksOutput()).success).toBe(false); // S-002 not in batch
    const missing = makeTasksOutputSchema({ storyIds: ['S-001', 'S-002', 'S-003'] });
    expect(missing.safeParse(validTasksOutput()).success).toBe(false); // S-003 has no tasks
    const ok = makeTasksOutputSchema({ storyIds: ['S-001', 'S-002'] });
    expect(ok.safeParse(validTasksOutput()).success).toBe(true);
  });
  it('caps merged tasks at 150', () => {
    expect(checkMergedTaskCount(150)).toBeNull();
    expect(checkMergedTaskCount(151)).toMatch(/150/);
  });
});

describe('stage 4: EstimatesOutput', () => {
  it('accepts a valid example', () => {
    expect(EstimatesOutputSchema.safeParse(validEstimatesOutput()).success).toBe(true);
  });
  it('rejects points outside the Fibonacci set', () => {
    const x = validEstimatesOutput();
    (x.estimates[0] as { points: number }).points = 4;
    expect(EstimatesOutputSchema.safeParse(x).success).toBe(false);
  });
  it('rejects a bad task id pattern and duplicate ids', () => {
    const bad = validEstimatesOutput();
    bad.estimates[0]!.task_id = 'T1';
    expect(EstimatesOutputSchema.safeParse(bad).success).toBe(false);
    const dup = validEstimatesOutput();
    dup.estimates[1]!.task_id = 'T-001';
    expect(EstimatesOutputSchema.safeParse(dup).success).toBe(false);
  });
  it('requires the task id set to equal the stamped set', () => {
    const strict = makeEstimatesOutputSchema({ taskIds: ['T-001', 'T-002'] });
    expect(strict.safeParse(validEstimatesOutput()).success).toBe(true);
    expect(
      makeEstimatesOutputSchema({ taskIds: ['T-001'] }).safeParse(validEstimatesOutput()).success,
    ).toBe(false);
    expect(
      makeEstimatesOutputSchema({ taskIds: ['T-001', 'T-002', 'T-003'] }).safeParse(
        validEstimatesOutput(),
      ).success,
    ).toBe(false);
  });
  it('reports missing and unknown ids', () => {
    const d = diffEstimateIds(validEstimatesOutput() as never, ['T-002', 'T-003']);
    expect(d).toEqual({ missing: ['T-003'], unknown: ['T-001'] });
  });
});

describe('stage 5: DependenciesOutput', () => {
  it('accepts a valid example', () => {
    expect(DependenciesOutputSchema.safeParse(validDependenciesOutput()).success).toBe(true);
  });
  it('rejects empty depends_on, more than 5 entries and bad ids', () => {
    const empty = validDependenciesOutput();
    empty.dependencies[0]!.depends_on = [];
    expect(DependenciesOutputSchema.safeParse(empty).success).toBe(false);
    const many = validDependenciesOutput();
    many.dependencies[0]!.depends_on = ['T-001', 'T-002', 'T-003', 'T-004', 'T-005', 'T-006'];
    expect(DependenciesOutputSchema.safeParse(many).success).toBe(false);
    const bad = validDependenciesOutput();
    bad.dependencies[0]!.depends_on = ['X-001'];
    expect(DependenciesOutputSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects a missing reason', () => {
    const x = validDependenciesOutput();
    delete (x.dependencies[0] as { reason?: string }).reason;
    expect(DependenciesOutputSchema.safeParse(x).success).toBe(false);
  });
});

describe('stage 7: RisksOutput', () => {
  it('accepts a valid example', () => {
    expect(RisksOutputSchema.safeParse(validRisksOutput()).success).toBe(true);
  });
  it('rejects an empty signal_ids list and a bad signal id pattern', () => {
    const none = validRisksOutput();
    none.risks[0]!.signal_ids = [];
    expect(RisksOutputSchema.safeParse(none).success).toBe(false);
    const bad = validRisksOutput();
    bad.risks[0]!.signal_ids = ['SG-1'];
    expect(RisksOutputSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects signal ids outside the computed set', () => {
    expect(
      makeRisksOutputSchema({ signalIds: ['SG-02'] }).safeParse(validRisksOutput()).success,
    ).toBe(false);
    expect(
      makeRisksOutputSchema({ signalIds: ['SG-01'] }).safeParse(validRisksOutput()).success,
    ).toBe(true);
  });
});
