import { aggregate, coefficientOfVariation } from './metrics.js';
import type { RunMetrics } from './metrics.js';
import type { EvalRunResult, PlannedRun } from './runner.js';

export interface ReportContext {
  date: string;
  provider: string;
  model: string;
  minIntervalMs: number;
  promptVersions: Record<string, string>;
  /** How the run ended: all planned runs finished, or the free quota / the provider stopped it. */
  stopReason: 'done' | 'quota_exhausted' | 'provider_outages' | 'in_progress';
  notRun: readonly PlannedRun[];
  /** What was asked on the command line, for the record (null for a merged report). */
  requested: { limit: number; repeatFirst: number } | null;
  /** Free text for the reader: the model switch, the quota finding, re-runs. Printed under the header. */
  notes?: readonly string[];
}

const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? String(Math.round(value * 1e4) / 1e4) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const CSV_COLUMNS: [string, (r: EvalRunResult) => unknown][] = [
  ['idea_id', (r) => r.idea.id],
  ['idea', (r) => r.idea.idea],
  ['repeat', (r) => r.repeat],
  ['run_id', (r) => r.runId],
  ['status', (r) => r.metrics.status],
  ['failed_stage', (r) => r.metrics.failedStage],
  ['failure_code', (r) => r.metrics.failureCode],
  ['model_calls', (r) => r.metrics.calls],
  ['calls_valid_first_try', (r) => r.metrics.callsFirstTryValid],
  ['repair_retries', (r) => r.metrics.repairRetries],
  ['llm_requests', (r) => r.metrics.llmRequests],
  ['calls_cut_off_by_provider', (r) => r.metrics.infraFailedCalls],
  ['stages_run', (r) => r.metrics.stagesRun],
  ['stages_failed_validation', (r) => r.metrics.stagesFailedValidation],
  ['stages_stopped_by_quota', (r) => r.metrics.stagesStoppedByQuota],
  ['refs_proposed', (r) => r.metrics.refsProposed],
  ['refs_invalid', (r) => r.metrics.refsInvalid],
  ['cycle_before_repair', (r) => r.metrics.cycleBeforeRepair],
  ['requirements', (r) => r.metrics.requirements],
  ['requirements_with_task', (r) => r.metrics.requirementsCovered],
  ['coverage_pct', (r) => r.metrics.coveragePct],
  ['stories', (r) => r.metrics.stories],
  ['tasks', (r) => r.metrics.tasks],
  ['tasks_per_story_mean', (r) => r.metrics.tasksPerStoryMean],
  ['tasks_per_story_min', (r) => r.metrics.tasksPerStoryMin],
  ['tasks_per_story_max', (r) => r.metrics.tasksPerStoryMax],
  ['tasks_flagged_duplicate', (r) => r.metrics.tasksFlaggedDuplicate],
  ['edges', (r) => r.metrics.edges],
  ['edges_per_task', (r) => r.metrics.edgesPerTask],
  ['cpm_hours', (r) => r.metrics.cpmHours],
  ['run_seconds', (r) => r.metrics.runSeconds],
  ['tokens_in', (r) => r.metrics.inputTokens],
  ['tokens_out', (r) => r.metrics.outputTokens],
];

export function toCsv(results: readonly EvalRunResult[]): string {
  const header = CSV_COLUMNS.map(([name]) => name).join(',');
  const rows = results.map((r) => CSV_COLUMNS.map(([, pick]) => csvCell(pick(r))).join(','));
  return `${[header, ...rows].join('\n')}\n`;
}

const fmt = (value: number | null, digits = 1, suffix = ''): string =>
  value === null ? 'n/a' : `${value.toFixed(digits)}${suffix}`;

const mdCell = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ');

const STOP_TEXT: Record<ReportContext['stopReason'], string> = {
  done: 'All planned runs were made.',
  in_progress: 'The evaluation is still running; this file is a partial result.',
  quota_exhausted:
    'The evaluation was LIMITED BY THE FREE QUOTA: the provider reported that the quota was used up, so the real calls stopped and the runs listed under "Not run" were not made. Every number below is measured on the runs that did finish; nothing is estimated.',
  provider_outages:
    'The evaluation stopped early because the provider kept failing (service errors, not quota). Every number below is measured on the runs that did finish.',
};

export function toMarkdown(results: readonly EvalRunResult[], ctx: ReportContext): string {
  const metrics = results.map((r) => r.metrics);
  const agg = aggregate(metrics);
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  push(
    `# LLM evaluation: ${ctx.model}, ${ctx.date}`,
    '',
    `- Provider: ${ctx.provider}, model \`${ctx.model}\`, minimum gap between calls ${ctx.minIntervalMs} ms.`,
    `- Prompt versions: ${Object.entries(ctx.promptVersions)
      .map(([k, v]) => `stage ${k} ${v}`)
      .join(', ')}.`,
    `- Protocol (MASTER_PLAN E3): cache disabled, one fresh run per idea, default team settings.`,
    ctx.requested
      ? `- Requested: \`--limit ${ctx.requested.limit} --repeat-first ${ctx.requested.repeatFirst}\`. Runs measured: ${agg.runsMeasured} (${agg.runsSucceeded} succeeded).`
      : `- Runs measured: ${agg.runsMeasured} (${agg.runsSucceeded} succeeded), merged from several result files.`,
    `- ${STOP_TEXT[ctx.stopReason]}`,
    '',
  );
  for (const note of ctx.notes ?? []) push(`> ${note}`, '');

  push('## Results (all measured runs)', '', '| Metric | Value | Basis |', '| --- | --- | --- |');
  const sumOf = (pick: (r: RunMetrics) => number) => metrics.reduce((a, r) => a + pick(r), 0);
  const calls = sumOf((r) => r.calls);
  const rows: [string, string, string][] = [
    [
      'Schema-valid first try',
      fmt(agg.firstTryValidPct, 1, '%'),
      `${sumOf((r) => r.callsFirstTryValid)} of ${calls} model calls`,
    ],
    [
      'Retry rate (repair retries per call)',
      fmt(agg.retryRate, 3),
      `${sumOf((r) => r.repairRetries)} retries over ${calls} calls`,
    ],
    [
      'Stage failure rate',
      fmt(agg.stageFailurePct, 1, '%'),
      `${sumOf((r) => r.stagesFailedValidation)} of ${sumOf((r) => r.stagesRun)} stages failed after retries`,
    ],
    [
      'Invalid-reference rate',
      fmt(agg.invalidReferencePct, 2, '%'),
      `${sumOf((r) => r.refsInvalid)} unknown references of ${sumOf((r) => r.refsProposed)} proposed (story to requirement, task to story, dependency edges)`,
    ],
    [
      'Cycle rate (before repair)',
      fmt(agg.cycleRatePct, 1, '%'),
      `${metrics.filter((r) => r.cycleBeforeRepair === true).length} of ${metrics.filter((r) => r.cycleBeforeRepair !== null).length} runs that reached the end of stage 5`,
    ],
    [
      'Requirement coverage',
      `${fmt(agg.coveragePctMean, 1, '%')} mean, ${fmt(agg.coveragePctMin, 1, '%')} lowest`,
      `${agg.runsSucceeded} succeeded runs`,
    ],
    [
      'Duplicate-task rate (title similarity >= 0.8)',
      fmt(agg.duplicateTaskPct, 1, '%'),
      `${agg.runsSucceeded} succeeded runs`,
    ],
    [
      'Tasks per story',
      `${fmt(agg.tasksPerStoryMean, 2)} mean, range ${fmt(agg.tasksPerStoryMin, 0)} to ${fmt(agg.tasksPerStoryMax, 0)}`,
      `${agg.runsSucceeded} succeeded runs`,
    ],
    ['Edges per task', fmt(agg.edgesPerTaskMean, 2), `${agg.runsSucceeded} succeeded runs`],
    [
      'Run time (wall clock)',
      `${fmt(agg.runSecondsMean, 1, ' s')} mean, ${fmt(agg.runSecondsMax, 1, ' s')} longest`,
      `${agg.runsSucceeded} succeeded runs`,
    ],
    [
      'Tokens',
      `${agg.inputTokensTotal} in, ${agg.outputTokensTotal} out`,
      `all ${agg.runsMeasured} measured runs; cost per run not computed (free tier)`,
    ],
  ];
  for (const [name, value, basis] of rows) push(`| ${name} | ${value} | ${basis} |`);
  push(
    '',
    'Calls that the provider cut off (quota or service errors) are left out of the validity metrics, because they say nothing about the model output; they are counted per run in the CSV (calls_cut_off_by_provider).',
    '',
  );

  push(
    '## Per run',
    '',
    '| Idea | Rep | Run | Status | Calls | First-try valid | Retries | Coverage | Tasks | Edges | CPM h | Time s | Tokens in/out |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const r of results) {
    const m = r.metrics;
    const status =
      m.status === 'failed'
        ? `failed (stage ${m.failedStage ?? '?'}, ${m.failureCode ?? 'unknown'})`
        : m.status;
    push(
      `| ${r.idea.id}. ${mdCell(r.idea.idea)} | ${r.repeat} | \`${r.runId.slice(0, 8)}\` | ${status} | ${m.calls} | ${m.callsFirstTryValid} | ${m.repairRetries} | ${fmt(m.coveragePct, 1, '%')} | ${m.tasks ?? 'n/a'} | ${m.edges ?? 'n/a'} | ${m.cpmHours ?? 'n/a'} | ${fmt(m.runSeconds, 1)} | ${m.inputTokens}/${m.outputTokens} |`,
    );
  }
  push('');

  // Consistency: runs of the same idea that succeeded.
  const byIdea = new Map<number, EvalRunResult[]>();
  for (const r of results) {
    if (r.metrics.status !== 'succeeded') continue;
    byIdea.set(r.idea.id, [...(byIdea.get(r.idea.id) ?? []), r]);
  }
  const repeated = [...byIdea.values()].filter((g) => g.length >= 2);
  push('## Consistency across repeats', '');
  if (repeated.length === 0) {
    push(
      'No idea has two or more succeeded runs, so no coefficient of variation can be computed. Repeats were not run or did not finish (see the stop reason above).',
      '',
    );
  } else {
    push(
      'Coefficient of variation = sample standard deviation / mean.',
      '',
      '| Idea | Runs | Task counts | CV of task count | CPM hours | CV of CPM duration |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const group of repeated) {
      const tasks = group.map((g) => g.metrics.tasks ?? 0);
      const cpm = group.map((g) => g.metrics.cpmHours ?? 0);
      const cvTasks = coefficientOfVariation(tasks);
      const cvCpm = coefficientOfVariation(cpm);
      push(
        `| ${group[0]?.idea.id}. ${mdCell(group[0]?.idea.idea ?? '')} | ${group.length} | ${tasks.join(', ')} | ${cvTasks === null ? 'n/a' : cvTasks.toFixed(3)} | ${cpm.join(', ')} | ${cvCpm === null ? 'n/a' : cvCpm.toFixed(3)} |`,
      );
    }
    push('');
  }

  push('## Not run', '');
  if (ctx.notRun.length === 0) {
    push('Nothing was skipped.', '');
  } else {
    push(
      `${ctx.notRun.length} planned run(s) were not made:`,
      '',
      ...ctx.notRun.map((p) => `- idea ${p.idea.id} "${p.idea.idea}", repeat ${p.repeat}`),
      '',
    );
  }

  push(
    '## Not measured by this script',
    '',
    '- Human rubric (1 to 5): see `eval/rubric.md`. The scores are filled in by the team, two raters per plan.',
    '- Cost per run in money: the free tier has no price; the token counts above are the measured basis.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

// ------------------------------------------------------------------ reading a CSV back

/** Minimal RFC 4180 reader for the files `toCsv` writes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Rebuilds the measured runs from a CSV written by `toCsv` (used to merge result files). */
export function resultsFromCsv(text: string): EvalRunResult[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const names = CSV_COLUMNS.map(([name]) => name);
  if (names.join(',') !== header.join(',')) {
    throw new Error('Not an evaluation CSV (the columns differ).');
  }
  return rows
    .filter((r) => r.length === names.length)
    .map((r) => {
      const get = (name: string) => r[names.indexOf(name)] ?? '';
      const num = (name: string): number | null => (get(name) === '' ? null : Number(get(name)));
      const need = (name: string): number => num(name) ?? 0;
      const bool = (name: string): boolean | null =>
        get(name) === '' ? null : get(name) === 'true';
      const metrics: RunMetrics = {
        status: get('status') as RunMetrics['status'],
        failedStage: num('failed_stage'),
        failureCode: get('failure_code') === '' ? null : get('failure_code'),
        calls: need('model_calls'),
        callsFirstTryValid: need('calls_valid_first_try'),
        repairRetries: need('repair_retries'),
        llmRequests: need('llm_requests'),
        infraFailedCalls: need('calls_cut_off_by_provider'),
        stagesRun: need('stages_run'),
        stagesFailedValidation: need('stages_failed_validation'),
        stagesStoppedByQuota: need('stages_stopped_by_quota'),
        refsProposed: need('refs_proposed'),
        refsInvalid: need('refs_invalid'),
        cycleBeforeRepair: bool('cycle_before_repair'),
        requirements: num('requirements'),
        requirementsCovered: num('requirements_with_task'),
        coveragePct: num('coverage_pct'),
        stories: num('stories'),
        tasks: num('tasks'),
        tasksPerStoryMean: num('tasks_per_story_mean'),
        tasksPerStoryMin: num('tasks_per_story_min'),
        tasksPerStoryMax: num('tasks_per_story_max'),
        tasksFlaggedDuplicate: num('tasks_flagged_duplicate'),
        edges: num('edges'),
        edgesPerTask: num('edges_per_task'),
        cpmHours: num('cpm_hours'),
        inputTokens: need('tokens_in'),
        outputTokens: need('tokens_out'),
        runSeconds: need('run_seconds'),
      };
      return {
        idea: { id: need('idea_id'), slug: '', idea: get('idea') },
        repeat: need('repeat'),
        runId: get('run_id'),
        metrics,
      };
    });
}
