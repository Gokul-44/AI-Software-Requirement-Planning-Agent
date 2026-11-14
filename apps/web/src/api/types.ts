export type {
  ApiError as ApiErrorBody,
  Config,
  ConfigPatch,
  CycleInfo,
  CreateProjectRequest,
  CreateProjectResponse,
  DemoGoldenItem,
  Issue,
  Plan,
  PlanDependency,
  PlanRequirement,
  PlanStory,
  PlanTask,
  ProjectListItem,
  RerunRequest,
  ResolveCycleRequest,
  RunCreatedResponse,
  RunStatus,
  Signal,
} from '@spm/shared';

export type ExportKind = 'jira' | 'markdown' | 'json';

/** A file ready to be saved by the browser. */
export interface ExportFile {
  filename: string;
  mime: string;
  content: string;
}

export const EXPORT_LABELS: Record<ExportKind, string> = {
  jira: 'Jira CSV',
  markdown: 'Markdown',
  json: 'JSON',
};
