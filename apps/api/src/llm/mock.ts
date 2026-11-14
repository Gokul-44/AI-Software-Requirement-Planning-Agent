import { createHash } from 'node:crypto';
import type { LlmClient, LlmRequest, LlmResponse } from './types.js';
import { LlmPermanentError } from './errors.js';
import {
  CoverageInputSchema,
  Stage1InputSchema,
  Stage2InputSchema,
  Stage3InputSchema,
} from '../pipeline/inputs.js';
import type { CoverageInput, RequirementBrief, StoryBrief } from '../pipeline/inputs.js';

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

function mockTasks(stories: StoryBrief[]) {
  const tasks = stories.flatMap((story) => {
    const goal = clip(story.i_want, 60);
    const platform = /operator|admin/i.test(story.as_a);
    const note = `Part of ${story.id}. ${clip(story.acceptance_criteria[0] ?? story.i_want, 200)}`;
    const items = [
      {
        layer: platform ? 'devops' : 'backend',
        title: `${platform ? 'Set up' : 'Implement API for'}: ${goal}`,
      },
      {
        layer: platform ? 'backend' : 'frontend',
        title: `${platform ? 'Instrument' : 'Build UI for'}: ${goal}`,
      },
      { layer: 'testing', title: `Write automated tests for: ${goal}` },
    ];
    return items.map((t) => ({
      story_id: story.id,
      title: clip(t.title, 100),
      description: note,
      layer: t.layer,
    }));
  });
  return { tasks };
}
