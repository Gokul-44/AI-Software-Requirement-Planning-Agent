import type { Plan } from '@spm/shared';

export type PlanStory = Plan['stories'][number];
export type PlanTask = Plan['tasks'][number];

/** Codes are zero padded (T-001), so plain string order is numeric order. */
export const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(byCode);
}

/**
 * Stories have no title of their own. This is the one-line form used in Jira summaries and
 * Markdown headings: the "I want" clause, without a leading "to" and a final full stop, capitalised.
 */
export function storyTitle(story: Pick<PlanStory, 'i_want'>, max = 120): string {
  const text = story.i_want
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/, '')
    .replace(/^to\s+/i, '');
  const cased = text.charAt(0).toUpperCase() + text.slice(1);
  return cased.length > max ? `${cased.slice(0, max - 1).trimEnd()}…` : cased;
}

/** The full user-story sentence: "As a X, I want Y, so that Z." */
export function storySentence(story: Pick<PlanStory, 'as_a' | 'i_want' | 'so_that'>): string {
  return `As a ${story.as_a}, I want ${story.i_want}, so that ${story.so_that}.`;
}

export function totalPoints(tasks: readonly Pick<PlanTask, 'points'>[]): number {
  return tasks.reduce((sum, t) => sum + t.points, 0);
}
