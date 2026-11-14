import { describe, expect, it } from 'vitest';
import { RequirementsOutputSchema, StoriesOutputSchema, TasksOutputSchema } from '@spm/shared';
import { MockLlmClient } from '../llm/mock.js';
import { stampRequirements, stampStoryTree, stampTasks } from './stamping.js';
import type { EpicDraft, TaskDraft } from './stamping.js';

const mock = new MockLlmClient();
const ask = async (stage: 1 | 2 | 3, schemaName: string, input: unknown) =>
  (
    await mock.generateStructured({
      stage,
      system: '',
      user: '',
      schema: RequirementsOutputSchema,
      schemaName,
      mode: 'extract',
      maxOutputTokens: 1,
      context: { promptVersion: 'v1', input },
    })
  ).raw;

const BOUNDS = { min_requirements: 5, max_requirements: 25 };

describe('id stamping', () => {
  it('numbers requirements R-001.. in output order, deterministically', async () => {
    const out = RequirementsOutputSchema.parse(
      await ask(1, 'Requirements', { idea: 'a tool for tracking gym workouts', bounds: BOUNDS }),
    );
    const a = stampRequirements(out);
    const b = stampRequirements(structuredClone(out));
    expect(a).toEqual(b);
    expect(a.map((r) => r.code)).toEqual(a.map((_, i) => `R-${String(i + 1).padStart(3, '0')}`));
    expect(a.every((r) => (r.type === 'non_functional') === (r.category !== null))).toBe(true);
  });

  it('stamps epics and stories across the tree, and sorts and de-duplicates requirement links', () => {
    const story = (ids: string[]) => ({
      as_a: 'user',
      i_want: 'x',
      so_that: 'y',
      acceptance_criteria: ['a', 'b'],
      priority: 'must' as const,
      requirement_ids: ids,
    });
    const epics: EpicDraft[] = [
      {
        title: 'One',
        description: '',
        stories: [story(['R-002', 'R-001', 'R-002']), story(['R-003'])],
      },
      { title: 'Two', description: '', stories: [story(['R-004'])] },
    ];
    const tree = stampStoryTree(epics);
    expect(tree.epics.map((e) => e.code)).toEqual(['E-001', 'E-002']);
    expect(tree.stories.map((s) => [s.code, s.epicCode])).toEqual([
      ['S-001', 'E-001'],
      ['S-002', 'E-001'],
      ['S-003', 'E-002'],
    ]);
    expect(tree.stories[0]?.requirementCodes).toEqual(['R-001', 'R-002']);
  });

  it('numbers tasks in story order no matter how the batches or tasks were ordered', async () => {
    const reqs = stampRequirements(
      RequirementsOutputSchema.parse(
        await ask(1, 'Requirements', { idea: 'a tool', bounds: BOUNDS }),
      ),
    );
    const stories = StoriesOutputSchema.parse(
      await ask(2, 'Stories', {
        summary: 's',
        requirements: reqs.map((r) => ({
          id: r.code,
          type: r.type,
          text: r.text,
          priority: r.priority,
        })),
      }),
    );
    const tree = stampStoryTree(stories.epics);
    const drafts: TaskDraft[] = TasksOutputSchema.parse(
      await ask(3, 'Tasks', {
        summary: 's',
        epic: { id: 'E-001', title: 't' },
        stories: tree.stories.map((s) => ({
          id: s.code,
          as_a: s.asA,
          i_want: s.iWant,
          so_that: s.soThat,
          acceptance_criteria: s.acceptanceCriteria,
        })),
      }),
    ).tasks;

    const forward = stampTasks(tree.stories, drafts);
    // A different arrival order across stories (for example a batch that finished first) must
    // not change the numbering: group the tasks of each story, then reverse the groups.
    const groups = tree.stories.map((s) => drafts.filter((d) => d.story_id === s.code));
    const shuffled = [...groups].reverse().flat();
    const reordered = stampTasks(tree.stories, shuffled);
    expect(reordered).toEqual(forward);
    expect(forward[0]?.code).toBe('T-001');
    expect(forward.map((t) => t.code)).toEqual(
      forward.map((_, i) => `T-${String(i + 1).padStart(3, '0')}`),
    );
    expect(forward.map((t) => t.storyCode)).toEqual([...forward.map((t) => t.storyCode)].sort());
    expect(forward).toEqual(stampTasks(tree.stories, structuredClone(drafts)));
  });
});
