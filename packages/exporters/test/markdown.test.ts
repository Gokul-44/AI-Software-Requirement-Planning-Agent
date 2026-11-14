import { describe, expect, it } from 'vitest';
import { escapeMarkdown, toMarkdown } from '../src/index.js';
import { loadFixture } from './helpers.js';

describe('toMarkdown on the food-delivery fixture', () => {
  const plan = loadFixture();
  const md = toMarkdown(plan);

  it('matches the snapshot', () => {
    expect(md).toMatchSnapshot();
  });

  it('is deterministic', () => {
    expect(toMarkdown(loadFixture())).toBe(md);
  });

  it('contains every T-code, and every other code of the plan', () => {
    const ids = [
      ...plan.tasks.map((t) => t.id),
      ...plan.requirements.map((r) => r.id),
      ...plan.epics.map((e) => e.id),
      ...plan.stories.map((s) => s.id),
      ...plan.risks.map((r) => r.id),
      ...plan.signals.map((s) => s.id),
      ...plan.issues.map((i) => i.id),
    ];
    for (const id of ids) expect(md, id).toContain(id);
    for (const t of plan.tasks) expect(md, t.id).toContain(t.id);
  });

  it('has the sections of the plan', () => {
    for (const heading of [
      '## Overview',
      '## Assumptions',
      '## Requirements traceability',
      '## Epics, stories and tasks',
      '## Sprint plan',
      '## Schedule',
      '## Risks',
      '## Issues',
    ]) {
      expect(md).toContain(`\n${heading}\n`);
    }
  });

  it('shows each risk with the signals it cites', () => {
    for (const risk of plan.risks) {
      for (const sid of risk.signal_ids) {
        const signal = plan.signals.find((s) => s.id === sid);
        expect(md).toContain(`- ${sid} (${signal?.kind}, ${signal?.severity}):`);
      }
    }
  });

  it('includes a Mermaid gantt and a critical-path graph', () => {
    const blocks = [...md.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1] ?? '');
    expect(blocks).toHaveLength(2);
    const gantt = blocks.find((b) => b.startsWith('gantt'));
    const graph = blocks.find((b) => b.startsWith('graph LR'));
    expect(gantt).toBeDefined();
    expect(graph).toBeDefined();
    for (const t of plan.tasks) expect(gantt, t.id).toContain(`${t.id} `);
    for (const id of plan.schedule.cpm.critical_path) {
      expect(graph, id).toContain(`${id.replace('-', '_')}["${id} `);
    }
    expect(gantt).toContain('crit, ');
    expect(graph).toContain(' --> ');
  });
});

describe('Markdown escaping (N11)', () => {
  it('turns raw HTML into entities and defuses link syntax', () => {
    expect(escapeMarkdown('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(escapeMarkdown('[click](javascript:alert(1))')).toBe('\\[click\\](javascript:alert(1))');
    expect(escapeMarkdown('a & b')).toBe('a &amp; b');
  });

  it('keeps model text from injecting HTML, table cells or Mermaid syntax', () => {
    const plan = loadFixture();
    const [task] = plan.tasks;
    const [story] = plan.stories;
    const [risk] = plan.risks;
    if (task === undefined || story === undefined || risk === undefined) throw new Error('empty');
    task.title = '<img src=x onerror=alert(1)> | pipe "quote" : colon';
    story.i_want = '<b>bold</b>\n# not a heading';
    risk.description = '<script>alert(1)</script>';
    plan.project.idea_text = '<iframe src="http://evil.example"></iframe>';

    const md = toMarkdown(plan);
    expect(md).not.toMatch(/<(script|img|iframe|b)[\s>]/i);
    expect(md).toContain('&lt;script&gt;');
    expect(md).toContain('\\| pipe');
    const mermaid = [...md.matchAll(/```mermaid\n([\s\S]*?)```/g)]
      .map((m) => m[1] ?? '')
      .join('\n');
    expect(mermaid).not.toMatch(/<[a-z]/i);
    // Only our own `-->` arrows may contain a greater-than sign.
    expect(mermaid.replace(/-->/g, '')).not.toContain('>');
  });
});
