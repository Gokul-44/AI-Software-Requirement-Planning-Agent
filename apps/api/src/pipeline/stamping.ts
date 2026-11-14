import type { RequirementsOutput, StoriesOutput, TasksOutput } from '@spm/shared';
import type { EpicRow, RequirementRow, StoryRow, TaskRow } from '../db/repository.js';

/**
 * ID stamping (MASTER_PLAN B3.3). The LLM never assigns ids: code numbers items in the order
 * they appear, so the same validated output always gives the same ids (deterministic).
 */
export const makeCode = (prefix: string, n: number) => `${prefix}-${String(n).padStart(3, '0')}`;

export type StoryDraft = StoriesOutput['epics'][number]['stories'][number];
export interface EpicDraft {
  title: string;
  description: string;
  stories: StoryDraft[];
}
export type TaskDraft = TasksOutput['tasks'][number];

/** R-001... in output order. */
export function stampRequirements(output: RequirementsOutput): RequirementRow[] {
  return output.requirements.map((r, i) => ({
    code: makeCode('R', i + 1),
    type: r.type,
    category: r.type === 'non_functional' ? (r.category ?? 'other') : null,
    text: r.text.trim(),
    priority: r.priority,
  }));
}

/** E-001... in epic order, S-001... across epics in story order. */
export function stampStoryTree(epics: EpicDraft[]): { epics: EpicRow[]; stories: StoryRow[] } {
  const epicRows: EpicRow[] = [];
  const storyRows: StoryRow[] = [];
  let storyNo = 0;
  epics.forEach((epic, ei) => {
    const epicCode = makeCode('E', ei + 1);
    epicRows.push({
      code: epicCode,
      title: epic.title.trim(),
      description: epic.description.trim(),
    });
    for (const s of epic.stories) {
      storyRows.push({
        code: makeCode('S', ++storyNo),
        epicCode,
        asA: s.as_a.trim(),
        iWant: s.i_want.trim(),
        soThat: s.so_that.trim(),
        acceptanceCriteria: s.acceptance_criteria.map((c) => c.trim()),
        priority: s.priority,
        requirementCodes: [...new Set(s.requirement_ids)].sort(),
      });
    }
  });
  return { epics: epicRows, stories: storyRows };
}

/**
 * T-001... after merging the epic batches in epic then story order, so the numbering does not
 * depend on which batch finished first or on the order the model listed the tasks across stories.
 * Within one story the model's order is kept.
 */
export function stampTasks(stories: StoryRow[], tasks: TaskDraft[]): TaskRow[] {
  const byStory = new Map<string, TaskDraft[]>();
  for (const t of tasks) {
    const list = byStory.get(t.story_id) ?? [];
    list.push(t);
    byStory.set(t.story_id, list);
  }
  const rows: TaskRow[] = [];
  let n = 0;
  for (const story of stories) {
    for (const t of byStory.get(story.code) ?? []) {
      rows.push({
        code: makeCode('T', ++n),
        storyCode: story.code,
        title: t.title.trim(),
        description: t.description.trim(),
        layer: t.layer,
      });
    }
  }
  return rows;
}
