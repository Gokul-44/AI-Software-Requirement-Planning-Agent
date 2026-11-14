import type { Plan } from '../src/index.js';

/** A small, valid, internally consistent plan.json v1.0 (fresh copy on every call). */
export function validPlan(): Plan {
  return {
    schema_version: '1.0',
    project: {
      id: '11111111-1111-4111-8111-111111111111',
      idea_text: 'A food delivery app for one city',
      created_at: '2026-11-14T10:00:00.000Z',
    },
    run: {
      id: '22222222-2222-4222-8222-222222222222',
      status: 'succeeded',
      created_at: '2026-11-14T10:00:01.000Z',
      finished_at: '2026-11-14T10:02:23.000Z',
      llm: {
        provider: 'replay',
        model: 'replay-v1',
        prompt_versions: { '1': 'v1', '2': 'v1', '3': 'v1', '4': 'v1', '5': 'v1', '7': 'v1' },
      },
      config: {
        team_size: 4,
        velocity_points_per_person: 10,
        sprint_length_days: 10,
        focus_hours_per_day: 6,
        points_to_hours: { '1': 4, '2': 8, '3': 12, '5': 20, '8': 32, '13': 52 },
        pack_mode: 'relaxed',
      },
      usage: { input_tokens: 27000, output_tokens: 28000, est_cost_usd: 0.33, duration_ms: 142000 },
    },
    summary: 'A city-wide food delivery platform for customers, restaurants and couriers.',
    assumptions: ['Single city launch'],
    requirements: [
      {
        id: 'R-001',
        type: 'functional',
        category: null,
        text: 'Customers can browse restaurants and place orders.',
        priority: 'must',
        story_ids: ['S-001', 'S-002'],
        task_ids: ['T-001', 'T-002', 'T-003'],
      },
      {
        id: 'R-002',
        type: 'non_functional',
        category: 'performance',
        text: 'Order placement completes within two seconds.',
        priority: 'should',
        story_ids: ['S-002'],
        task_ids: ['T-003'],
      },
    ],
    epics: [
      {
        id: 'E-001',
        title: 'Ordering',
        description: 'Everything a customer needs to order food.',
        story_ids: ['S-001', 'S-002'],
      },
    ],
    stories: [
      {
        id: 'S-001',
        epic_id: 'E-001',
        as_a: 'customer',
        i_want: 'to browse restaurants',
        so_that: 'I can choose where to order from',
        acceptance_criteria: ['Restaurants are listed', 'Listing can be filtered'],
        priority: 'must',
        requirement_ids: ['R-001'],
        task_ids: ['T-001', 'T-002'],
      },
      {
        id: 'S-002',
        epic_id: 'E-001',
        as_a: 'customer',
        i_want: 'to place an order',
        so_that: 'food is delivered to me',
        acceptance_criteria: ['Order is created', 'Order confirmation is shown'],
        priority: 'must',
        requirement_ids: ['R-001', 'R-002'],
        task_ids: ['T-003'],
      },
    ],
    tasks: [
      {
        id: 'T-001',
        story_id: 'S-001',
        title: 'Create restaurant tables',
        description: 'Schema for restaurants and menus.',
        layer: 'database',
        points: 2,
        hours: 8,
        estimate_rationale: 'Small schema.',
        requirement_ids: ['R-001'],
      },
      {
        id: 'T-002',
        story_id: 'S-001',
        title: 'Restaurant listing endpoint',
        description: 'GET /restaurants with filters.',
        layer: 'backend',
        points: 3,
        hours: 12,
        estimate_rationale: 'Filtering adds some work.',
        requirement_ids: ['R-001'],
      },
      {
        id: 'T-003',
        story_id: 'S-002',
        title: 'Order placement flow',
        description: 'Checkout UI and order API.',
        layer: 'integration',
        points: 5,
        hours: 20,
        estimate_rationale: 'Crosses frontend and backend.',
        requirement_ids: ['R-001', 'R-002'],
      },
    ],
    dependencies: [
      {
        from: 'T-001',
        to: 'T-002',
        type: 'FS',
        source: 'llm',
        reason: 'Endpoint needs the tables.',
      },
      { from: 'T-002', to: 'T-003', type: 'FS', source: 'llm', reason: 'Checkout needs listing.' },
    ],
    schedule: {
      unit: 'hours',
      cpm: { duration_hours: 40, duration_days: 6.7, critical_path: ['T-001', 'T-002', 'T-003'] },
      capacity_plan: {
        sprint_count: 1,
        duration_days: 10,
        capacity_points_per_sprint: 40,
        hours_per_sprint: 60,
      },
      tasks: [
        {
          task_id: 'T-001',
          es: 0,
          ef: 8,
          ls: 0,
          lf: 8,
          slack: 0,
          critical: true,
          sprint: 1,
          planned_start: 0,
          planned_finish: 8,
          descendants: 2,
        },
        {
          task_id: 'T-002',
          es: 8,
          ef: 20,
          ls: 8,
          lf: 20,
          slack: 0,
          critical: true,
          sprint: 1,
          planned_start: 8,
          planned_finish: 20,
          descendants: 1,
        },
        {
          task_id: 'T-003',
          es: 20,
          ef: 40,
          ls: 20,
          lf: 40,
          slack: 0,
          critical: true,
          sprint: 1,
          planned_start: 20,
          planned_finish: 40,
          descendants: 0,
        },
      ],
      sprints: [
        {
          number: 1,
          load_points: 10,
          capacity_points: 40,
          utilisation: 0.25,
          task_ids: ['T-001', 'T-002', 'T-003'],
        },
      ],
    },
    signals: [
      {
        id: 'SG-01',
        kind: 'critical_path_length',
        severity: 'high',
        value: 1,
        threshold: 0.4,
        task_ids: ['T-001', 'T-002', 'T-003'],
        message: '100% of tasks are on the critical path.',
      },
    ],
    risks: [
      {
        id: 'RK-001',
        severity: 'high',
        title: 'Fully serial plan',
        description: 'Every task sits on the critical path, so any delay moves the end date.',
        mitigation: 'Split T-002 so the checkout UI can start earlier.',
        signal_ids: ['SG-01'],
        origin: 'llm',
      },
    ],
    coverage: {
      requirements_total: 2,
      requirements_with_story: 2,
      requirements_with_task: 2,
      uncovered_requirement_ids: [],
      stories_without_tasks: [],
    },
    issues: [
      {
        id: 'I-001',
        stage: 5,
        severity: 'warning',
        kind: 'unknown_reference',
        message: 'Edge T-099->T-002 dropped: T-099 does not exist.',
        refs: ['T-099', 'T-002'],
        resolution: 'dropped',
      },
    ],
  };
}

export function validRequirementsOutput() {
  return {
    summary: 'A city-wide food delivery platform for customers and couriers.',
    assumptions: ['Single city launch'],
    requirements: [
      { type: 'functional', text: 'Customers can browse restaurants.', priority: 'must' },
      { type: 'functional', text: 'Customers can place an order.', priority: 'must' },
      { type: 'functional', text: 'Couriers can accept deliveries.', priority: 'should' },
      { type: 'functional', text: 'Restaurants can manage their menus.', priority: 'should' },
      {
        type: 'non_functional',
        category: 'performance',
        text: 'Pages load within two seconds.',
        priority: 'could',
      },
    ],
  };
}

export function validStoriesOutput() {
  const story = (rid: string) => ({
    as_a: 'customer',
    i_want: 'to do something useful',
    so_that: 'I get value',
    acceptance_criteria: ['It works', 'It is tested'],
    priority: 'must',
    requirement_ids: [rid],
  });
  return {
    epics: [
      { title: 'Ordering', description: 'Order flow', stories: [story('R-001'), story('R-002')] },
      { title: 'Delivery', description: 'Courier flow', stories: [story('R-003')] },
    ],
  };
}

export function validTasksOutput() {
  return {
    tasks: [
      { story_id: 'S-001', title: 'Create tables', description: 'Schema', layer: 'database' },
      { story_id: 'S-002', title: 'Build endpoint', description: 'API', layer: 'backend' },
    ],
  };
}

export function validEstimatesOutput() {
  return {
    estimates: [
      { task_id: 'T-001', points: 2, rationale: 'Small.' },
      { task_id: 'T-002', points: 5, rationale: 'Medium.' },
    ],
  };
}

export function validDependenciesOutput() {
  return {
    dependencies: [{ task_id: 'T-002', depends_on: ['T-001'], reason: 'Needs the tables.' }],
  };
}

export function validRisksOutput() {
  return {
    risks: [
      {
        title: 'Serial plan',
        description: 'Everything is on the critical path.',
        mitigation: 'Parallelise.',
        signal_ids: ['SG-01'],
      },
    ],
  };
}
