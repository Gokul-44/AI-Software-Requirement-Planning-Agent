import { createHash } from 'node:crypto';
import type { LlmClient, LlmRequest, LlmResponse } from './types.js';
import { LlmPermanentError } from './errors.js';
import {
  CoverageInputSchema,
  Stage1InputSchema,
  Stage2InputSchema,
  Stage3InputSchema,
  Stage4InputSchema,
  Stage5InputSchema,
  Stage5RepairInputSchema,
  Stage7InputSchema,
} from '../pipeline/inputs.js';
import type {
  CoverageInput,
  DependencyTask,
  RequirementBrief,
  Stage4Input,
  Stage5Input,
  Stage5RepairInput,
  Stage7Input,
  StoryBrief,
} from '../pipeline/inputs.js';

/**
 * Deterministic provider for tests, offline work and CI. It builds schema-valid, plausible
 * output for ANY idea from the stage input alone (no randomness, no clock, no network).
 */
export class MockLlmClient implements LlmClient {
  readonly provider = 'mock';
  readonly model = 'mock-1';

  generateStructured<T>(req: LlmRequest<T>): Promise<LlmResponse> {
    const started = performance.now();
    const output = generate(req.stage, req.schemaName, req.context.input);
    const text = JSON.stringify(output);
    return Promise.resolve({
      raw: output,
      usage: {
        inputTokens: Math.ceil((req.system.length + req.user.length) / 4),
        outputTokens: Math.ceil(text.length / 4),
      },
      stopReason: 'end',
      model: this.model,
      latencyMs: Math.round(performance.now() - started),
    });
  }
}

function generate(stage: number, schemaName: string, input: unknown): unknown {
  if (stage === 1) return mockRequirements(Stage1InputSchema.parse(input).idea);
  if (stage === 2 && schemaName === 'CoverageStories') {
    return mockCoverageStories(CoverageInputSchema.parse(input));
  }
  if (stage === 2) return mockStories(Stage2InputSchema.parse(input).requirements);
  if (stage === 3) return mockTasks(Stage3InputSchema.parse(input).stories);
  if (stage === 4) return mockEstimates(Stage4InputSchema.parse(input));
  if (stage === 5 && schemaName === 'DependenciesRepair') {
    return mockRepair(Stage5RepairInputSchema.parse(input));
  }
  if (stage === 5) return mockDependencies(Stage5InputSchema.parse(input));
  if (stage === 7) return mockRisks(Stage7InputSchema.parse(input));
  throw new LlmPermanentError(`The mock provider has no generator for stage ${stage}.`);
}

// ----------------------------------------------------------------------------- helpers

function hashNumber(text: string): number {
  return createHash('sha256').update(text).digest().readUInt32BE(0);
}

const LEADING = /^(i|we)\s+(want|need|would like|plan)\s+(to\s+(build|make|create|develop)\s+)?/i;
const LEADING_VERB = /^(build|make|create|develop)\s+(me\s+)?/i;
const ARTICLE = /^(a|an|the|my|our)\s+/i;
const TRAILING = /\s+(app|application|platform|system|website|site|software|tool|service)$/i;

/** "I want an online food delivery app" becomes "online food delivery". */
export function subjectOf(idea: string): string {
  let s = idea.trim().replace(/[.!?]+$/, '');
  s = s.replace(LEADING, '').replace(LEADING_VERB, '').replace(ARTICLE, '').replace(TRAILING, '');
  const subject = s.split(/\s+/).filter(Boolean).slice(0, 5).join(' ').toLowerCase();
  return subject.length >= 3 ? subject : 'the product';
}

const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`;

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

// ----------------------------------------------------------------------------- stage 1

type MockReq = {
  type: 'functional' | 'non_functional';
  category?: 'performance' | 'security' | 'usability' | 'reliability';
  text: string;
  priority: 'must' | 'should' | 'could';
};

function mockRequirements(idea: string) {
  const subject = subjectOf(idea);
  const fn = (priority: MockReq['priority'], text: string): MockReq => ({
    type: 'functional',
    priority,
    text,
  });
  const nfr = (
    category: NonNullable<MockReq['category']>,
    priority: MockReq['priority'],
    text: string,
  ): MockReq => ({ type: 'non_functional', category, priority, text });

  const functional: MockReq[] = [
    fn('must', 'Users can register, sign in and manage their profile securely.'),
    fn('must', `Users can search and browse ${subject} offerings with filters and sorting.`),
    fn(
      'must',
      `Users can view the details of a ${subject} item, including price and availability.`,
    ),
    fn('must', `Users can add items to a cart and place an order for ${subject}.`),
    fn('must', 'Users can pay online with a supported payment method and receive a receipt.'),
    fn('should', 'Users can track the status of an order in real time and receive notifications.'),
    fn('should', 'Users can view their order history and repeat a previous order.'),
    fn('should', 'Users can rate and review a completed order.'),
    fn('could', `Administrators can manage ${subject} catalogue data, users and reports.`),
  ];
  const nonFunctional: MockReq[] = [
    nfr(
      'performance',
      'must',
      'The system answers 95% of API requests in under 300 ms under normal load.',
    ),
    nfr(
      'security',
      'must',
      'The system encrypts personal and payment data in transit and at rest.',
    ),
    nfr(
      'reliability',
      'should',
      'The system is available at least 99.5% of the time, with automated backups.',
    ),
    nfr(
      'usability',
      'should',
      'The interface is responsive and meets WCAG 2.1 AA accessibility guidelines.',
    ),
  ];
  // The idea decides how many requirements appear, so different ideas give different sizes.
  const extra = hashNumber(idea) % 3;
  return {
    summary: clip(
      `A web product for ${subject}. Users discover and order, pay securely and follow progress, while administrators manage the catalogue and day to day operations.`,
      600,
    ),
    assumptions: [
      'A single region and a single currency at launch.',
      'Payments go through a third-party payment provider.',
      'The first release targets a web client; native apps follow later.',
    ],
    requirements: [
      ...functional.slice(0, 7 + extra),
      ...nonFunctional.slice(0, 3 + (extra > 0 ? 1 : 0)),
    ],
  };
}

// ----------------------------------------------------------------------------- stage 2

const EPIC_TITLES = [
  'Accounts & Access',
  'Discovery & Search',
  'Ordering & Checkout',
  'Fulfilment & Tracking',
  'Engagement & Feedback',
  'Administration',
];

function storyFor(req: RequirementBrief) {
  const operator = req.type === 'non_functional';
  const want = clip(lowerFirst(req.text.replace(/\.$/, '')), 180);
  return {
    as_a: operator ? 'platform operator' : 'user',
    i_want: want,
    so_that: operator
      ? 'the product stays fast, safe and dependable'
      : 'I can complete my goals without friction',
    acceptance_criteria: [
      `Given the feature is available, when it is used, then ${clip(want, 120)}.`,
      'Given invalid input, when the user submits it, then a clear error message is shown.',
      'Given normal load, when the feature is used, then it responds without noticeable delay.',
    ],
    priority: req.priority,
    requirement_ids: [req.id],
  };
}

function mockStories(requirements: RequirementBrief[]) {
  const functional = requirements.filter((r) => r.type === 'functional');
  const quality = requirements.filter((r) => r.type === 'non_functional').slice(0, 8);
  const chunkSize = Math.max(1, Math.ceil(functional.length / 6));
  const epics: { title: string; description: string; stories: ReturnType<typeof storyFor>[] }[] =
    [];
  for (let i = 0; i < functional.length; i += chunkSize) {
    const title = EPIC_TITLES[epics.length] ?? `Feature Area ${epics.length + 1}`;
    epics.push({
      title,
      description: `Delivers the ${title.toLowerCase()} capabilities.`,
      stories: functional.slice(i, i + chunkSize).map(storyFor),
    });
  }
  if (quality.length > 0 || epics.length < 2) {
    epics.push({
      title: 'Platform & Quality',
      description: 'Non-functional qualities expressed as technical stories.',
      stories: quality.map(storyFor),
    });
  }
  return { epics: epics.filter((e) => e.stories.length > 0) };
}

function mockCoverageStories(input: CoverageInput) {
  const target = input.epics[0]?.id ?? 'E-001';
  return { stories: input.uncovered.map((r) => ({ epic_id: target, ...storyFor(r) })) };
}

// ----------------------------------------------------------------------------- stage 3

/**
 * Follows prompt stage3.v2: the first story of each epic that stores data gets a `database` task
 * (the schema), and every other story's backend task names its create/read operations, so the
 * mock output has the same shape as a v2 answer.
 */
function mockTasks(stories: StoryBrief[]) {
  let schemaDone = false;
  const tasks = stories.flatMap((story) => {
    const goal = clip(story.i_want, 30);
    const platform = /operator|admin/i.test(story.as_a);
    const note = `Part of ${story.id}. ${clip(story.acceptance_criteria[0] ?? story.i_want, 200)}`;
    const items: { layer: string; title: string }[] = [];
    if (!platform && !schemaDone) {
      schemaDone = true;
      items.push({
        layer: 'database',
        title: `Create data model and migration for ${story.id}: ${goal}`,
      });
    }
    items.push(
      {
        layer: platform ? 'devops' : 'backend',
        title: platform
          ? `Set up ${story.id}: ${goal}`
          : `Implement create and read endpoints for ${story.id}: ${goal}`,
      },
      {
        layer: platform ? 'backend' : 'frontend',
        title: `${platform ? 'Instrument' : 'Build UI for'} ${story.id}: ${goal}`,
      },
      { layer: 'testing', title: `Write automated tests for ${story.id}: ${goal}` },
    );
    return items.map((t) => ({
      story_id: story.id,
      title: clip(t.title, 100),
      description: note,
      layer: t.layer,
    }));
  });
  return { tasks };
}

// ----------------------------------------------------------------------------- stage 4

const BASE_POINTS: Record<string, number[]> = {
  design: [2, 3, 3],
  database: [3, 3, 5],
  backend: [3, 5, 5],
  integration: [5, 8, 5],
  frontend: [3, 3, 5],
  testing: [2, 2, 3],
  devops: [2, 3, 3],
};

function mockEstimates(input: Stage4Input) {
  return {
    estimates: input.tasks.map((t) => {
      const choices = BASE_POINTS[t.layer] ?? [3];
      const points = choices[hashNumber(t.title) % choices.length] ?? 3;
      return {
        task_id: t.id,
        points,
        rationale: clip(
          `Typical ${t.layer} work of about ${points} points for one developer.`,
          160,
        ),
      };
    }),
  };
}

// ----------------------------------------------------------------------------- stage 5

/** Earlier layers first: the usual build order inside a feature. */
const LAYER_RANK: Record<string, number> = {
  devops: 0,
  design: 1,
  database: 2,
  backend: 3,
  integration: 3,
  frontend: 4,
  testing: 5,
};

interface MockEdge {
  task: string;
  dependsOn: string;
  reason: string;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const list = out.get(key(item)) ?? [];
    list.push(item);
    out.set(key(item), list);
  }
  return out;
}

/** Edges inside one story: each task waits for the previous layer, tests wait for the first task too. */
function storyEdges(tasks: DependencyTask[]): MockEdge[] {
  const ordered = [...tasks].sort(
    (a, b) => (LAYER_RANK[a.layer] ?? 3) - (LAYER_RANK[b.layer] ?? 3) || a.id.localeCompare(b.id),
  );
  const edges: MockEdge[] = [];
  ordered.forEach((t, i) => {
    const prev = ordered[i - 1];
    if (prev && prev.layer !== t.layer) {
      edges.push({
        task: t.id,
        dependsOn: prev.id,
        reason: `${t.layer} work follows ${prev.layer} work.`,
      });
    }
  });
  return edges;
}

function mockDependencies(input: Stage5Input) {
  const edges: MockEdge[] = [];
  const byEpic = groupBy(input.tasks, (t) => t.epic_id);
  const epicIds = [...byEpic.keys()].sort();
  if (input.scope !== 'cross') {
    for (const epicId of epicIds) {
      const tasks = byEpic.get(epicId) ?? [];
      const byStory = groupBy(tasks, (t) => t.story_id);
      const storyIds = [...byStory.keys()].sort();
      const foundation = [...(byStory.get(storyIds[0] ?? '') ?? [])].sort((a, b) =>
        a.id.localeCompare(b.id),
      )[0];
      storyIds.forEach((storyId, k) => {
        const storyTasks = byStory.get(storyId) ?? [];
        edges.push(...storyEdges(storyTasks));
        const first = [...storyTasks].sort((a, b) => a.id.localeCompare(b.id))[0];
        if (k > 0 && foundation && first) {
          edges.push({
            task: first.id,
            dependsOn: foundation.id,
            reason: 'Builds on the first story of the epic.',
          });
        }
      });
    }
  }
  if (input.scope !== 'epic') {
    const first = (epicId: string) =>
      [...(byEpic.get(epicId) ?? [])].sort((a, b) => a.id.localeCompare(b.id))[0];
    const root = first(epicIds[0] ?? '');
    for (const epicId of epicIds.slice(1)) {
      const head = first(epicId);
      if (root && head) {
        edges.push({
          task: head.id,
          dependsOn: root.id,
          reason: 'Needs the foundations of the first epic.',
        });
      }
    }
  }
  return toDependencies(edges);
}

function toDependencies(edges: MockEdge[]) {
  const byTask = new Map<string, { dependsOn: string[]; reason: string }>();
  for (const e of edges) {
    const entry = byTask.get(e.task) ?? { dependsOn: [], reason: e.reason };
    if (!entry.dependsOn.includes(e.dependsOn) && entry.dependsOn.length < 5) {
      entry.dependsOn.push(e.dependsOn);
    }
    byTask.set(e.task, entry);
  }
  return {
    dependencies: [...byTask.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([task, v]) => ({
        task_id: task,
        depends_on: v.dependsOn,
        reason: clip(v.reason, 160),
      })),
  };
}

/** Keeps only forward edges (the dependency has the lower id), which always breaks a loop. */
function mockRepair(input: Stage5RepairInput) {
  const edges: MockEdge[] = [];
  for (const group of input.groups) {
    for (const d of group.dependencies) {
      for (const dep of d.depends_on) {
        if (dep < d.task_id)
          edges.push({ task: d.task_id, dependsOn: dep, reason: 'Kept after loop repair.' });
      }
    }
  }
  return toDependencies(edges);
}

// ----------------------------------------------------------------------------- stage 7

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function mockRisks(input: Stage7Input) {
  const ranked = [...input.signals].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id),
  );
  const risks = ranked.slice(0, 4).map((signal) => {
    const named = signal.task_ids
      .map((id) => input.task_titles[id])
      .filter((t): t is string => t !== undefined)
      .slice(0, 2);
    return {
      title: clip(`Plan risk: ${signal.kind.replace(/_/g, ' ')}`, 100),
      description: clip(
        `${signal.message}${named.length > 0 ? ` Affected work: ${named.join('; ')}.` : ''}`,
        500,
      ),
      mitigation: 'Review this finding with the team, assign an owner and decide how to reduce it.',
      signal_ids: [signal.id],
    };
  });
  return { risks };
}
