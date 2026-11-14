import type { Plan } from '@spm/shared';
import { byCode, storySentence, storyTitle, totalPoints, uniqueSorted } from './common.js';

type Task = Plan['tasks'][number];
type ScheduleTask = Plan['schedule']['tasks'][number];

/**
 * Escapes text from the plan (LLM generated, so untrusted) for Markdown: raw HTML is turned into
 * entities and link or code syntax is neutralised (design document N11).
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`[\]]/g, (c) => `\\${c}`);
}

/** Text for one table cell: escaped, on one line, with pipes protected. */
const cell = (text: string): string =>
  escapeMarkdown(text)
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/\|/g, '\\|');

/** One line of prose or a heading: escaped and without line breaks. */
const line = (text: string): string => escapeMarkdown(text).replace(/\s*[\r\n]+\s*/g, ' ');

/** Text inside a Mermaid label: drops every character that Mermaid or Markdown could act on. */
function mermaidText(text: string): string {
  return text
    .replace(/[:;#%"'`<>[\]{}()|\\&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const codes = (ids: readonly string[]): string => (ids.length > 0 ? ids.join(', ') : '-');
const pct = (ratio: number): string => `${Math.round(ratio * 100)}%`;

/** Gantt day 1. Dates are placeholders: the chart counts working days from project start. */
const GANTT_DAY_ONE = Date.UTC(2026, 0, 5);
const DAY_MS = 86_400_000;
const ganttDate = (dayIndex: number): string =>
  new Date(GANTT_DAY_ONE + dayIndex * DAY_MS).toISOString().slice(0, 10);

/**
 * Human-readable plan: overview, assumptions, requirement traceability, the work breakdown,
 * sprints, schedule (Mermaid gantt and critical-path graph), risks with their cited signals,
 * signals and issues. Deterministic: the same plan always gives the same text.
 */
export function toMarkdown(plan: Plan): string {
  const out: string[] = [];
  const add = (...lines: string[]) => out.push(...lines);

  const tasks = [...plan.tasks].sort((a, b) => byCode(a.id, b.id));
  const stories = [...plan.stories].sort((a, b) => byCode(a.id, b.id));
  const epics = [...plan.epics].sort((a, b) => byCode(a.id, b.id));
  const requirements = [...plan.requirements].sort((a, b) => byCode(a.id, b.id));
  const sched = new Map<string, ScheduleTask>(plan.schedule.tasks.map((t) => [t.task_id, t]));
  const taskById = new Map<string, Task>(tasks.map((t) => [t.id, t]));
  const preds = new Map<string, string[]>();
  for (const d of plan.dependencies) preds.set(d.to, [...(preds.get(d.to) ?? []), d.from]);
  const cfg = plan.run.config;
  const cpm = plan.schedule.cpm;
  const cap = plan.schedule.capacity_plan;
  const criticalCount = plan.schedule.tasks.filter((t) => t.critical).length;
  const label = (id: string): string => `${id} ${taskById.get(id)?.title ?? ''}`.trim();

  // ------------------------------------------------------------------ title and overview
  add('# Project plan', '');
  add(...plan.project.idea_text.split(/\r?\n/).map((l) => `> ${escapeMarkdown(l)}`), '');
  add('## Overview', '', line(plan.summary), '');
  const functional = requirements.filter((r) => r.type === 'functional').length;
  const severities = (['high', 'medium', 'low'] as const).map(
    (s) => `${plan.risks.filter((r) => r.severity === s).length} ${s}`,
  );
  add(
    '| Measure | Value |',
    '| --- | --- |',
    `| Requirements | ${requirements.length} (${functional} functional, ${requirements.length - functional} non-functional) |`,
    `| Epics / stories / tasks | ${epics.length} / ${stories.length} / ${tasks.length} |`,
    `| Total estimate | ${totalPoints(tasks)} points, ${tasks.reduce((n, t) => n + t.hours, 0)} hours |`,
    `| Sprint plan | ${cap.sprint_count} sprints, ${cap.duration_days} days (capacity ${cap.capacity_points_per_sprint} points and ${cap.hours_per_sprint} h per sprint) |`,
    `| Shortest possible duration (CPM, unlimited people) | ${cpm.duration_hours} h, ${cpm.duration_days} working days |`,
    `| Critical tasks | ${criticalCount} of ${tasks.length} |`,
    `| Risks | ${plan.risks.length} (${severities.join(', ')}) |`,
    `| Issues | ${plan.issues.length} |`,
    '',
    `Configuration: ${cfg.team_size} people, ${cfg.velocity_points_per_person} points per person per sprint, ` +
      `${cfg.sprint_length_days}-day sprints, ${cfg.focus_hours_per_day} focus hours per day, ` +
      `${cfg.pack_mode} sprint packing. Plan schema ${plan.schema_version}.`,
    '',
  );

  // ------------------------------------------------------------------ assumptions
  add('## Assumptions', '');
  if (plan.assumptions.length === 0) add('None recorded.');
  for (const a of plan.assumptions) add(`- ${line(a)}`);
  add('');

  // ------------------------------------------------------------------ traceability
  add('## Requirements traceability', '');
  add(
    `${plan.coverage.requirements_with_story} of ${plan.coverage.requirements_total} requirements have a story and ` +
      `${plan.coverage.requirements_with_task} have a task. Uncovered: ${codes(plan.coverage.uncovered_requirement_ids)}.`,
    '',
    '| Requirement | Type | Priority | Text | Stories | Tasks |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const r of requirements) {
    const kind = r.category === null ? r.type : `${r.type} (${r.category})`;
    const uncovered = plan.coverage.uncovered_requirement_ids.includes(r.id);
    add(
      `| ${r.id} | ${cell(kind)} | ${r.priority} | ${cell(r.text)} | ${codes(uniqueSorted(r.story_ids))} | ` +
        `${uncovered && r.task_ids.length === 0 ? 'UNCOVERED' : codes(uniqueSorted(r.task_ids))} |`,
    );
  }
  add('');

  // ------------------------------------------------------------------ breakdown
  add('## Epics, stories and tasks', '');
  for (const epic of epics) {
    add(`### ${epic.id} ${line(epic.title)}`, '', line(epic.description), '');
    for (const story of stories.filter((s) => s.epic_id === epic.id)) {
      const storyTasks = tasks.filter((t) => t.story_id === story.id);
      add(
        `#### ${story.id} ${line(storyTitle(story))}`,
        '',
        `Priority: ${story.priority}. Requirements: ${codes(uniqueSorted(story.requirement_ids))}. ` +
          `${totalPoints(storyTasks)} points in ${storyTasks.length} tasks.`,
        '',
        line(storySentence(story)),
        '',
        'Acceptance criteria:',
        '',
        ...story.acceptance_criteria.map((c) => `- ${line(c)}`),
        '',
      );
      if (storyTasks.length > 0) {
        add(
          '| Task | Title | Layer | Points | Hours | Sprint | Depends on |',
          '| --- | --- | --- | --- | --- | --- | --- |',
        );
        for (const t of storyTasks) {
          const s = sched.get(t.id);
          add(
            `| ${t.id}${s?.critical ? ' (critical)' : ''} | ${cell(t.title)} | ${t.layer} | ${t.points} | ${t.hours} | ` +
              `${s?.sprint ?? '-'} | ${codes(uniqueSorted(preds.get(t.id) ?? []))} |`,
          );
        }
        add('');
      }
    }
  }

  // ------------------------------------------------------------------ sprints
  add('## Sprint plan', '');
  for (const sp of [...plan.schedule.sprints].sort((a, b) => a.number - b.number)) {
    add(
      `### Sprint ${sp.number}`,
      '',
      `Load: ${sp.load_points} of ${sp.capacity_points} points (${pct(sp.utilisation)}).`,
      '',
      '| Task | Title | Layer | Points | Planned hours |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const id of [...sp.task_ids].sort(byCode)) {
      const t = taskById.get(id);
      const s = sched.get(id);
      add(
        `| ${id}${s?.critical ? ' (critical)' : ''} | ${cell(t?.title ?? '')} | ${t?.layer ?? '-'} | ${t?.points ?? '-'} | ` +
          `${s?.planned_start ?? '-'} to ${s?.planned_finish ?? '-'} |`,
      );
    }
    add('');
  }

  // ------------------------------------------------------------------ schedule
  add('## Schedule', '');
  add(
    `Without a limit on people the plan could finish in ${cpm.duration_hours} h ` +
      `(${cpm.duration_days} working days). With the team and sprint capacity above it takes ` +
      `${cap.sprint_count} sprints (${cap.duration_days} days).`,
    '',
    `Critical path: ${cpm.critical_path.length > 0 ? cpm.critical_path.join(' -> ') : 'none'}.`,
    '',
  );

  const hoursPerDay = cfg.focus_hours_per_day;
  add(
    '### Gantt chart',
    '',
    'The capacity-feasible plan. Bars are placed in working days counted from project start ' +
      `(day 1 is shown as ${ganttDate(0)}; weekends are not modelled). Critical tasks are highlighted.`,
    '',
    '```mermaid',
    'gantt',
    '    title Sprint plan by working day',
    '    dateFormat YYYY-MM-DD',
    '    axisFormat %b %d',
  );
  for (const sp of [...plan.schedule.sprints].sort((a, b) => a.number - b.number)) {
    add(`    section Sprint ${sp.number}`);
    const members = sp.task_ids
      .map((id) => sched.get(id))
      .filter((s): s is ScheduleTask => s !== undefined)
      .sort((a, b) => a.planned_start - b.planned_start || byCode(a.task_id, b.task_id));
    for (const s of members) {
      const startDay = Math.floor(s.planned_start / hoursPerDay);
      const endDay = Math.max(startDay + 1, Math.ceil(s.planned_finish / hoursPerDay));
      const name = mermaidText(label(s.task_id));
      const id = `t${s.task_id.replace(/\D/g, '')}`;
      add(
        `    ${name} :${s.critical ? 'crit, ' : ''}${id}, ${ganttDate(startDay)}, ${ganttDate(endDay)}`,
      );
    }
  }
  add('```', '');

  add(
    '### Critical path graph',
    '',
    'Critical tasks have no slack. Arrows join critical tasks that directly follow each other.',
    '',
    '```mermaid',
    'graph LR',
  );
  const criticalIds = plan.schedule.tasks
    .filter((t) => t.critical)
    .sort((a, b) => a.es - b.es || byCode(a.task_id, b.task_id))
    .map((t) => t.task_id);
  const nodeId = (id: string) => id.replace(/\W/g, '_');
  for (const id of criticalIds) add(`    ${nodeId(id)}["${mermaidText(label(id))}"]`);
  const criticalSet = new Set(criticalIds);
  const edges = plan.dependencies
    .filter((d) => {
      const a = sched.get(d.from);
      const b = sched.get(d.to);
      return (
        criticalSet.has(d.from) &&
        criticalSet.has(d.to) &&
        a !== undefined &&
        b !== undefined &&
        a.ef === b.es
      );
    })
    .sort((a, b) => byCode(a.from, b.from) || byCode(a.to, b.to));
  for (const e of edges) add(`    ${nodeId(e.from)} --> ${nodeId(e.to)}`);
  add('```', '');

  // ------------------------------------------------------------------ risks
  add('## Risks', '');
  const signalById = new Map(plan.signals.map((s) => [s.id, s]));
  if (plan.risks.length === 0) add('No risks recorded.', '');
  for (const risk of [...plan.risks].sort((a, b) => byCode(a.id, b.id))) {
    add(
      `### ${risk.id} ${line(risk.title)}`,
      '',
      `Severity: ${risk.severity}. Origin: ${risk.origin}.`,
      '',
      line(risk.description),
      '',
      `Mitigation: ${line(risk.mitigation)}`,
      '',
      'Cited signals:',
      '',
    );
    for (const id of risk.signal_ids) {
      const s = signalById.get(id);
      add(
        s ? `- ${s.id} (${s.kind}, ${s.severity}): ${line(s.message)}` : `- ${id} (unknown signal)`,
      );
    }
    add('');
  }

  // ------------------------------------------------------------------ signals
  add('## Signals', '');
  if (plan.signals.length === 0) {
    add('No signals.', '');
  } else {
    add(
      'Computed by the scheduler; risks may cite only these.',
      '',
      '| Signal | Kind | Severity | Value | Threshold | Tasks | Message |',
      '| --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const s of plan.signals) {
      add(
        `| ${s.id} | ${s.kind} | ${s.severity} | ${s.value} | ${s.threshold ?? '-'} | ${codes([...s.task_ids].sort(byCode))} | ${cell(s.message)} |`,
      );
    }
    add('');
  }

  // ------------------------------------------------------------------ issues
  add('## Issues', '');
  if (plan.issues.length === 0) {
    add('No issues.', '');
  } else {
    add(
      '| Issue | Stage | Severity | Kind | Message | Resolution |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const i of plan.issues) {
      add(
        `| ${i.id} | ${i.stage} | ${i.severity} | ${i.kind} | ${cell(i.message)} | ${cell(i.resolution ?? '-')} |`,
      );
    }
    add('');
  }

  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}
