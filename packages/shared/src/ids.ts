import { z } from 'zod';

/** ID patterns from design document C4/C5. IDs are stamped by code, never by the LLM. */
export const ID_PATTERNS = {
  requirement: /^R-[0-9]{3}$/,
  epic: /^E-[0-9]{3}$/,
  story: /^S-[0-9]{3}$/,
  task: /^T-[0-9]{3}$/,
  signal: /^SG-[0-9]{2,3}$/,
  risk: /^RK-[0-9]{3}$/,
  issue: /^I-[0-9]{3}$/,
} as const;

export const RequirementId = z.string().regex(ID_PATTERNS.requirement);
export const EpicId = z.string().regex(ID_PATTERNS.epic);
export const StoryId = z.string().regex(ID_PATTERNS.story);
export const TaskId = z.string().regex(ID_PATTERNS.task);
export const SignalId = z.string().regex(ID_PATTERNS.signal);
export const RiskId = z.string().regex(ID_PATTERNS.risk);
export const IssueId = z.string().regex(ID_PATTERNS.issue);

export const Priority = z.enum(['must', 'should', 'could']);
export type Priority = z.infer<typeof Priority>;

export const RequirementType = z.enum(['functional', 'non_functional']);
export type RequirementType = z.infer<typeof RequirementType>;

export const RequirementCategory = z.enum([
  'performance',
  'security',
  'usability',
  'reliability',
  'scalability',
  'compliance',
  'maintainability',
  'other',
]);
export type RequirementCategory = z.infer<typeof RequirementCategory>;

export const Layer = z.enum([
  'frontend',
  'backend',
  'database',
  'devops',
  'testing',
  'design',
  'integration',
]);
export type Layer = z.infer<typeof Layer>;

export const Points = z.literal([1, 2, 3, 5, 8, 13]);
export type Points = z.infer<typeof Points>;
export const POINT_VALUES = [1, 2, 3, 5, 8, 13] as const;

export const Severity3 = z.enum(['low', 'medium', 'high']);
export type Severity3 = z.infer<typeof Severity3>;
