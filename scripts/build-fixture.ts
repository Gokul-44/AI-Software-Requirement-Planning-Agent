/**
 * Builds the hand-written TEST FIXTURE plan (provider "fixture", model "hand-written"). It is used
 * by unit tests only. The golden demo plans in apps/web/public/golden are real model output
 * exported with `npm run golden:export`; this script no longer writes there.
 *
 *   npm run fixture
 *
 * fixtures/plan-input.food-delivery.json (hand-written: keys, no ids)
 *   -> stamp ids -> schedulePlan (CPM, sprint packing, signals) -> hand-written risks that cite
 *   real signal ids -> assemble plan.json -> PlanSchema + assertPlanIntegrity -> write files.
 *
 * Outputs (all regenerated, never edited by hand):
 *   fixtures/test-plan.food-delivery.json
 *   docs/samples/jira-sample.csv
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { toJiraCsv } from '@spm/exporters';
import { schedulePlan } from '@spm/scheduler';
import type { PlanCore } from '@spm/scheduler';
import { DEFAULT_CONFIG, PlanSchema, assertPlanIntegrity } from '@spm/shared';
import type { Issue, Plan, Signal } from '@spm/shared';

// ---------------------------------------------------------------------------- input shape

interface InputRequirement {
  key: string;
  type: Plan['requirements'][number]['type'];
  category: Plan['requirements'][number]['category'];
  priority: Plan['requirements'][number]['priority'];
  text: string;
}
interface InputEpic {
  key: string;
  title: string;
  description: string;
}
interface InputStory {
  key: string;
  epic: string;
  priority: Plan['stories'][number]['priority'];
  as_a: string;
  i_want: string;
  so_that: string;
  acceptance_criteria: string[];
  requirements: string[];
}
interface InputTask {
  key: string;
  story: string;
  layer: Plan['tasks'][number]['layer'];
  points: Plan['tasks'][number]['points'];
  title: string;
  description: string;
  rationale: string;
  /** Optional narrower list than the story's; must be a subset of it. */
  requirements?: string[];
}
interface InputDependency {
  /** A task key, or a literal T-code. A code that matches no task models an LLM slip. */
  from: string;
  to: string;
  reason: string;
}
interface FixtureInput {
  idea_text: string;
  assumptions: string[];
  requirements: InputRequirement[];
  epics: InputEpic[];
  stories: InputStory[];
  tasks: InputTask[];
  dependencies: InputDependency[];
}

// ---------------------------------------------------------------------------- helpers

const root = path.resolve(import.meta.dirname, '..');
const inputPath = path.join(root, 'fixtures', 'plan-input.food-delivery.json');
const outputPaths = [path.join(root, 'fixtures', 'test-plan.food-delivery.json')];
const csvPath = path.join(root, 'docs', 'samples', 'jira-sample.csv');

const code = (prefix: string, index: number) => `${prefix}-${String(index + 1).padStart(3, '0')}`;
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function stamp<T extends { key: string }>(prefix: string, items: T[]): Map<string, string> {
  const map = new Map<string, string>();
  items.forEach((item, i) => {
    if (map.has(item.key)) throw new Error(`Duplicate ${prefix} key "${item.key}".`);
    map.set(item.key, code(prefix, i));
  });
  return map;
}

function resolve(map: Map<string, string>, key: string, where: string): string {
  const id = map.get(key);
  if (id === undefined) throw new Error(`${where}: unknown key "${key}".`);
  return id;
}

// ---------------------------------------------------------------------------- 1. load and stamp

const input = JSON.parse(readFileSync(inputPath, 'utf8')) as FixtureInput;
const config = DEFAULT_CONFIG;

const reqIds = stamp('R', input.requirements);
const epicIds = stamp('E', input.epics);
const storyIds = stamp('S', input.stories);
const taskIds = stamp('T', input.tasks);

const storyReqs = new Map<string, string[]>(
  input.stories.map((s) => [
    resolve(storyIds, s.key, 'story'),
    s.requirements.map((k) => resolve(reqIds, k, `story ${s.key}`)),
  ]),
);

const tasks: Plan['tasks'] = input.tasks.map((t) => {
  const id = resolve(taskIds, t.key, 'task');
  const storyId = resolve(storyIds, t.story, `task ${t.key}`);
  const fromStory = storyReqs.get(storyId) ?? [];
  const requirement_ids = (
    t.requirements ??
    input.stories.find((s) => s.key === t.story)?.requirements ??
    []
  )
    .map((k) => resolve(reqIds, k, `task ${t.key}`))
    .sort(byCode);
  for (const r of requirement_ids) {
    if (!fromStory.includes(r)) throw new Error(`Task ${id} cites ${r}, which its story does not.`);
  }
  return {
    id,
    story_id: storyId,
    title: t.title,
    description: t.description,
    layer: t.layer,
    points: t.points,
    hours: config.points_to_hours[String(t.points) as keyof typeof config.points_to_hours],
    estimate_rationale: t.rationale,
    requirement_ids,
  };
});

const stories: Plan['stories'] = input.stories.map((s) => {
  const id = resolve(storyIds, s.key, 'story');
  return {
    id,
    epic_id: resolve(epicIds, s.epic, `story ${s.key}`),
    as_a: s.as_a,
    i_want: s.i_want,
    so_that: s.so_that,
    acceptance_criteria: s.acceptance_criteria,
    priority: s.priority,
    requirement_ids: [...(storyReqs.get(id) ?? [])].sort(byCode),
    task_ids: tasks.filter((t) => t.story_id === id).map((t) => t.id),
  };
});

const epics: Plan['epics'] = input.epics.map((e) => {
  const id = resolve(epicIds, e.key, 'epic');
  return {
    id,
    title: e.title,
    description: e.description,
    story_ids: stories.filter((s) => s.epic_id === id).map((s) => s.id),
  };
});

const requirements: Plan['requirements'] = input.requirements.map((r) => {
  const id = resolve(reqIds, r.key, 'requirement');
  return {
    id,
    type: r.type,
    category: r.category,
    text: r.text,
    priority: r.priority,
    story_ids: stories.filter((s) => s.requirement_ids.includes(id)).map((s) => s.id),
    task_ids: tasks.filter((t) => t.requirement_ids.includes(id)).map((t) => t.id),
  };
});

const taskCodeLike = /^T-[0-9]{3}$/;
const endpoint = (key: string) =>
  taskIds.get(key) ?? (taskCodeLike.test(key) ? key : resolve(taskIds, key, 'dependency'));
const reasonOf = new Map<string, string>();
const rawDependencies = input.dependencies.map((d) => {
  const from = endpoint(d.from);
  const to = endpoint(d.to);
  const edgeKey = `${from}>${to}`;
  if (!reasonOf.has(edgeKey)) reasonOf.set(edgeKey, d.reason);
  return { from, to };
});

// ---------------------------------------------------------------------------- 2. schedule

const core: PlanCore = {
  requirements: requirements.map((r) => ({ id: r.id, priority: r.priority })),
  stories: stories.map((s) => ({ id: s.id, requirement_ids: s.requirement_ids })),
  tasks: tasks.map((t) => ({
    id: t.id,
    story_id: t.story_id,
    title: t.title,
    layer: t.layer,
    points: t.points,
    hours: t.hours,
  })),
  dependencies: rawDependencies,
};

const result = schedulePlan(core, config);
if (!result.ok) {
  const cycles = result.cyclePaths.map((p) => p.join(' -> ')).join('; ');
  throw new Error(`The fixture dependencies contain a cycle: ${cycles}`);
}
const { schedule, signals, coverage } = result;

const dependencies: Plan['dependencies'] = result.dependencies.map((e) => ({
  from: e.from,
  to: e.to,
  type: 'FS',
  source: 'llm',
  reason: reasonOf.get(`${e.from}>${e.to}`) ?? null,
}));

// ---------------------------------------------------------------------------- 3. issues

const issues: Issue[] = [...result.issues];
const nextIssueId = () => `I-${String(issues.length + 1).padStart(3, '0')}`;
for (const id of coverage.uncovered_requirement_ids) {
  const req = requirements.find((r) => r.id === id);
  if (req === undefined) continue;
  issues.push({
    id: nextIssueId(),
    stage: 2,
    severity: 'warning',
    kind: 'uncovered_requirement',
    message: `${id} (${req.priority}) has no story, so no task can trace to it.`,
    refs: [id],
    resolution: 'Flagged for the user; no story was generated for it.',
  });
}
for (const id of coverage.stories_without_tasks) {
  issues.push({
    id: nextIssueId(),
    stage: 3,
    severity: 'warning',
    kind: 'story_without_tasks',
    message: `${id} has no tasks.`,
    refs: [id],
    resolution: null,
  });
}

// ---------------------------------------------------------------------------- 4. risks

type SignalKind = Signal['kind'];
interface RiskDef {
  origin: 'llm' | 'template';
  title: string;
  /** Signals the risk cites. `task` or `match` picks one signal when a kind has several. */
  cites: { kind: SignalKind; task?: string; match?: (s: Signal) => boolean }[];
  /** Receives the cited signals, in the order of `cites`. */
  describe: (cited: Signal[]) => string;
  mitigation: string;
}

const T = (key: string): string => resolve(taskIds, key, 'risk');

function findSignal(cite: RiskDef['cites'][number]): Signal {
  const match = signals.find(
    (s) =>
      s.kind === cite.kind &&
      (cite.task === undefined || s.task_ids.includes(cite.task)) &&
      (cite.match === undefined || cite.match(s)),
  );
  if (match === undefined) {
    throw new Error(
      `No computed signal of kind ${cite.kind}${cite.task ? ` for ${cite.task}` : ''}.`,
    );
  }
  return match;
}

/**
 * Hand-written, in the voice the risk stage (7) would produce. They only reuse the wording and
 * numbers of the signals they cite, and the code below rejects any number that no cited signal holds.
 * Severity is not written here: it is the highest severity among the cited signals (N6).
 */
const RISKS: RiskDef[] = [
  {
    origin: 'llm',
    title: 'The backend chain decides the finish date',
    cites: [{ kind: 'critical_path_length' }, { kind: 'critical_layer_concentration' }],
    describe: ([length, layer]) =>
      `${length?.message} ${layer?.message} Most of the longest path is backend work done one task ` +
      `after another, so a slip in any of those tasks moves the release date, and a second developer ` +
      `cannot shorten a chain of dependent tasks.`,
    mitigation:
      'Name an owner per critical backend task, review designs before coding starts, and split the largest ' +
      'tasks so that frontend and testing work can begin on agreed API contracts while the backend is built.',
  },
  {
    origin: 'llm',
    title: 'Payment and order state work gates tracking, notifications and couriers',
    cites: [
      { kind: 'critical_high_fanout', task: T('payment-api') },
      { kind: 'critical_high_fanout', task: T('order-status-api') },
    ],
    describe: ([payment, status]) =>
      `${payment?.message} ${status?.message} Both tasks sit on the critical path, and the payment ` +
      `provider's sandbox onboarding and webhook behaviour are outside the team's control.`,
    mitigation:
      'Open the payment provider account and start its sandbox integration in the first sprint, agree the ' +
      'order status transitions early so dependent screens can use a stub, and keep a mock payment mode for demos.',
  },
  {
    origin: 'llm',
    title: 'The sprints have no spare capacity',
    cites: [{ kind: 'sprint_overload' }],
    describe: ([overload]) =>
      `${overload?.message} A plan that is already full cannot absorb sick days, ` +
      `review rework or one underestimated task.`,
    mitigation:
      'Move low-priority work out of the first two sprints, leave a deliberate buffer in sprint planning, ' +
      'and re-estimate after the first sprint using the real completed points.',
  },
  {
    origin: 'llm',
    title: 'Little testing before a late integration point',
    cites: [{ kind: 'layer_imbalance' }, { kind: 'high_fan_in', task: T('e2e-tests') }],
    describe: ([testing, fanIn]) =>
      `${testing?.message} ${fanIn?.message} Problems between the customer, restaurant and courier ` +
      `screens would first show up near the end, when little time is left to fix them.`,
    mitigation:
      'Add unit and API tests to each backend task definition of done, add a payment-flow test task, and run ' +
      'a thin end-to-end journey as soon as checkout works rather than waiting for the last screen.',
  },
  {
    origin: 'template',
    title: 'High-severity signal: critical_high_fanout',
    cites: [{ kind: 'critical_high_fanout', task: T('menu-schema') }],
    describe: ([signal]) => `${signal?.message}`,
    mitigation:
      'Review this signal with the team, assign an owner and decide whether the task can be split or started earlier.',
  },
];

const SEVERITY_RANK = { low: 0, medium: 1, high: 2 } as const;

const risks: Plan['risks'] = RISKS.map((def, i) => {
  const cited = def.cites.map(findSignal);
  const severity = cited.reduce<Signal['severity']>(
    (top, s) => (SEVERITY_RANK[s.severity] > SEVERITY_RANK[top] ? s.severity : top),
    'low',
  );
  const description = def.describe(cited);
  assertGrounded(description, cited, def.title);
  return {
    id: code('RK', i),
    severity,
    title: def.title,
    description,
    mitigation: def.mitigation,
    signal_ids: cited.map((s) => s.id),
    origin: def.origin,
  };
});

/** B5 numeric grounding: every number in a risk text must appear in a cited signal. */
function assertGrounded(text: string, cited: Signal[], title: string): void {
  const haystack = cited
    .map((s) => `${s.message} ${s.value} ${s.threshold ?? ''} ${Math.round(s.value * 100)}`)
    .join(' ');
  const known = new Set(haystack.match(/\d+(?:\.\d+)?/g) ?? []);
  const numbers = text.replace(/\b[A-Z]{1,2}-\d+\b/g, ' ').match(/\d+(?:\.\d+)?/g) ?? [];
  const ungrounded = numbers.filter((n) => !known.has(n));
  if (ungrounded.length > 0) {
    throw new Error(
      `Risk "${title}" uses numbers that no cited signal contains: ${ungrounded.join(', ')}.`,
    );
  }
}

// ---------------------------------------------------------------------------- 5. assemble

const totalPoints = tasks.reduce((n, t) => n + t.points, 0);
const plan: Plan = {
  schema_version: '1.0',
  project: {
    id: '3f6c1b2a-8d4e-4b7a-9c15-6a2e0f9d7b31',
    idea_text: input.idea_text,
    created_at: '2026-11-14T09:00:00.000Z',
  },
  run: {
    id: 'b7e2c9d4-5a1f-4e83-8f26-1d9a3c4b5e60',
    status: 'succeeded',
    created_at: '2026-11-14T09:00:01.000Z',
    finished_at: '2026-11-14T09:02:23.000Z',
    llm: {
      provider: 'fixture',
      model: 'hand-written',
      prompt_versions: { '1': 'v1', '2': 'v1', '3': 'v1', '4': 'v1', '5': 'v1', '7': 'v1' },
    },
    config,
    usage: { input_tokens: 27000, output_tokens: 28000, est_cost_usd: 0.33, duration_ms: 142000 },
  },
  summary:
    `An online food delivery platform for one city: customers browse, order, pay and track, ` +
    `restaurants run menus and orders, and couriers deliver. ${requirements.length} requirements ` +
    `become ${epics.length} epics, ${stories.length} stories and ${tasks.length} tasks ` +
    `(${totalPoints} points) over ${schedule.capacity_plan.sprint_count} sprints.`,
  assumptions: input.assumptions,
  requirements,
  epics,
  stories,
  tasks,
  dependencies,
  schedule,
  signals,
  risks,
  coverage,
  issues,
};

// ---------------------------------------------------------------------------- 6. validate and write

const valid = PlanSchema.parse(plan);
assertPlanIntegrity(valid);

const json = `${JSON.stringify(valid, null, 2)}\n`;
for (const file of outputPaths) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, json, 'utf8');
}
mkdirSync(path.dirname(csvPath), { recursive: true });
writeFileSync(csvPath, toJiraCsv(valid), 'utf8');

const critical = schedule.tasks.filter((t) => t.critical).length;
console.log(
  `Fixture OK: ${requirements.length} requirements, ${epics.length} epics, ${stories.length} stories, ` +
    `${tasks.length} tasks, ${dependencies.length} dependencies, ${signals.length} signals, ` +
    `${risks.length} risks, ${issues.length} issues.`,
);
console.log(
  `Schedule: CPM ${schedule.cpm.duration_hours} h, ${schedule.capacity_plan.sprint_count} sprints, ` +
    `${critical} critical tasks.`,
);
console.log(
  `Signals:\n${signals.map((s) => `  ${s.id} ${s.kind} [${s.severity}] ${s.message}`).join('\n')}`,
);
