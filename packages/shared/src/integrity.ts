import type { Plan } from './plan.js';

export class PlanIntegrityError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(
      `Plan integrity check failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n` +
        problems.map((p) => `  - ${p}`).join('\n'),
    );
    this.name = 'PlanIntegrityError';
    this.problems = problems;
  }
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

/**
 * Returns every broken cross-reference in a schema-valid plan. Empty array means the plan is sound.
 * Checks id uniqueness, that every referenced id resolves, and that the derived two-way links
 * (requirement <-> story <-> task, epic <-> story) agree in both directions.
 * `issues[].refs` is free-form (it may name ids that were dropped) and is not checked.
 */
export function findPlanIntegrityProblems(plan: Plan): string[] {
  const problems: string[] = [];
  const add = (msg: string) => problems.push(msg);

  const reqIds = new Set(plan.requirements.map((r) => r.id));
  const epicIds = new Set(plan.epics.map((e) => e.id));
  const storyIds = new Set(plan.stories.map((s) => s.id));
  const taskIds = new Set(plan.tasks.map((t) => t.id));
  const signalIds = new Set(plan.signals.map((s) => s.id));

  const lists: [string, string[]][] = [
    ['requirement', plan.requirements.map((r) => r.id)],
    ['epic', plan.epics.map((e) => e.id)],
    ['story', plan.stories.map((s) => s.id)],
    ['task', plan.tasks.map((t) => t.id)],
    ['signal', plan.signals.map((s) => s.id)],
    ['risk', plan.risks.map((r) => r.id)],
    ['issue', plan.issues.map((i) => i.id)],
  ];
  for (const [label, ids] of lists) {
    for (const d of duplicates(ids)) add(`Duplicate ${label} id ${d}.`);
  }

  const need = (set: Set<string>, id: string, where: string) => {
    if (!set.has(id)) add(`${where} references unknown id ${id}.`);
  };

  const storyById = new Map(plan.stories.map((s) => [s.id, s]));
  const epicById = new Map(plan.epics.map((e) => [e.id, e]));
  const taskById = new Map(plan.tasks.map((t) => [t.id, t]));
  const reqById = new Map(plan.requirements.map((r) => [r.id, r]));

  // Requirements.
  for (const r of plan.requirements) {
    for (const id of r.story_ids) {
      need(storyIds, id, `requirement ${r.id}.story_ids`);
      const s = storyById.get(id);
      if (s && !s.requirement_ids.includes(r.id)) {
        add(
          `requirement ${r.id} lists story ${id}, but ${id}.requirement_ids does not list ${r.id}.`,
        );
      }
    }
    for (const id of r.task_ids) {
      need(taskIds, id, `requirement ${r.id}.task_ids`);
      const t = taskById.get(id);
      if (t && !t.requirement_ids.includes(r.id)) {
        add(
          `requirement ${r.id} lists task ${id}, but ${id}.requirement_ids does not list ${r.id}.`,
        );
      }
    }
  }

  // Epics.
  for (const e of plan.epics) {
    for (const id of e.story_ids) {
      need(storyIds, id, `epic ${e.id}.story_ids`);
      const s = storyById.get(id);
      if (s && s.epic_id !== e.id) {
        add(`epic ${e.id} lists story ${id}, but ${id}.epic_id is ${s.epic_id}.`);
      }
    }
  }

  // Stories.
  for (const s of plan.stories) {
    need(epicIds, s.epic_id, `story ${s.id}.epic_id`);
    const e = epicById.get(s.epic_id);
    if (e && !e.story_ids.includes(s.id)) {
      add(`story ${s.id} names epic ${s.epic_id}, but the epic's story_ids does not list it.`);
    }
    for (const id of s.requirement_ids) {
      need(reqIds, id, `story ${s.id}.requirement_ids`);
      const r = reqById.get(id);
      if (r && !r.story_ids.includes(s.id)) {
        add(`story ${s.id} lists requirement ${id}, but ${id}.story_ids does not list ${s.id}.`);
      }
    }
    for (const id of s.task_ids) {
      need(taskIds, id, `story ${s.id}.task_ids`);
      const t = taskById.get(id);
      if (t && t.story_id !== s.id) {
        add(`story ${s.id} lists task ${id}, but ${id}.story_id is ${t.story_id}.`);
      }
    }
  }

  // Tasks.
  for (const t of plan.tasks) {
    need(storyIds, t.story_id, `task ${t.id}.story_id`);
    const s = storyById.get(t.story_id);
    if (s && !s.task_ids.includes(t.id)) {
      add(`task ${t.id} names story ${t.story_id}, but the story's task_ids does not list it.`);
    }
    for (const id of t.requirement_ids) {
      need(reqIds, id, `task ${t.id}.requirement_ids`);
      const r = reqById.get(id);
      if (r && !r.task_ids.includes(t.id)) {
        add(`task ${t.id} lists requirement ${id}, but ${id}.task_ids does not list ${t.id}.`);
      }
    }
  }

  // Dependencies.
  const edgeKeys = new Set<string>();
  for (const d of plan.dependencies) {
    need(taskIds, d.from, `dependency ${d.from}->${d.to}.from`);
    need(taskIds, d.to, `dependency ${d.from}->${d.to}.to`);
    if (d.from === d.to) add(`Dependency ${d.from}->${d.to} is a self loop.`);
    const key = `${d.from}->${d.to}`;
    if (edgeKeys.has(key)) add(`Duplicate dependency ${key}.`);
    edgeKeys.add(key);
  }

  // Schedule.
  const schedTaskIds = plan.schedule.tasks.map((t) => t.task_id);
  for (const id of schedTaskIds) need(taskIds, id, 'schedule.tasks');
  for (const d of duplicates(schedTaskIds)) add(`schedule.tasks has duplicate entry for ${d}.`);
  for (const id of taskIds) {
    if (!schedTaskIds.includes(id)) add(`Task ${id} has no entry in schedule.tasks.`);
  }
  for (const id of plan.schedule.cpm.critical_path) {
    need(taskIds, id, 'schedule.cpm.critical_path');
  }
  const sprintOfTask = new Map<string, number>();
  for (const sp of plan.schedule.sprints) {
    for (const id of sp.task_ids) {
      need(taskIds, id, `schedule.sprints[${sp.number}].task_ids`);
      if (sprintOfTask.has(id)) add(`Task ${id} appears in more than one sprint.`);
      sprintOfTask.set(id, sp.number);
    }
  }
  for (const d of duplicates(plan.schedule.sprints.map((s) => String(s.number)))) {
    add(`Duplicate sprint number ${d}.`);
  }
  for (const st of plan.schedule.tasks) {
    const inSprint = sprintOfTask.get(st.task_id);
    if (inSprint === undefined) {
      add(`Task ${st.task_id} is scheduled but is not in any sprint's task_ids.`);
    } else if (inSprint !== st.sprint) {
      add(`Task ${st.task_id} has sprint ${st.sprint} but is listed in sprint ${inSprint}.`);
    }
  }

  // Signals, risks, coverage.
  for (const s of plan.signals) {
    for (const id of s.task_ids) need(taskIds, id, `signal ${s.id}.task_ids`);
  }
  for (const r of plan.risks) {
    for (const id of r.signal_ids) need(signalIds, id, `risk ${r.id}.signal_ids`);
  }
  for (const id of plan.coverage.uncovered_requirement_ids) {
    need(reqIds, id, 'coverage.uncovered_requirement_ids');
  }
  for (const id of plan.coverage.stories_without_tasks) {
    need(storyIds, id, 'coverage.stories_without_tasks');
  }

  return problems;
}

/** Throws PlanIntegrityError when any cross-reference does not resolve. */
export function assertPlanIntegrity(plan: Plan): void {
  const problems = findPlanIntegrityProblems(plan);
  if (problems.length > 0) throw new PlanIntegrityError(problems);
}
