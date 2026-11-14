import { describe, expect, it } from 'vitest';
import { csvCell, neutraliseFormula, toCsv, toJiraCsv } from '../src/index.js';
import { loadFixture, parseCsv } from './helpers.js';

describe('csv helpers', () => {
  it('quotes commas, quotes and line breaks (RFC 4180)', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(5)).toBe('5');
  });

  it('round-trips awkward text through a parser', () => {
    const awkward = ['a,b', 'say "hi"', 'two\nlines', 'crlf\r\nline', '', 'x'];
    const parsed = parseCsv(toCsv([awkward, awkward]));
    expect(parsed).toEqual([awkward, awkward]);
  });
});

describe('formula injection (N11)', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tcmd', '\rcmd'])(
    'prefixes %j with an apostrophe',
    (s) => {
      expect(neutraliseFormula(s)).toBe(`'${s}`);
    },
  );

  it.each(['Normal', '1=1', 'a+b', 'x@y', '', ' =padded'])('leaves %j alone', (s) => {
    expect(neutraliseFormula(s)).toBe(s);
  });

  it('escapes every dangerous cell in the Jira export', () => {
    const plan = loadFixture();
    const payloads = [
      '=HYPERLINK("http://evil.example","Click")',
      '+1+1',
      '-2+3',
      '@SUM(A1:A9)',
      '\tTabbed',
      '\rReturned',
    ];
    const [epic] = plan.epics;
    const [task] = plan.tasks;
    if (epic === undefined || task === undefined) throw new Error('fixture is empty');
    epic.description = payloads[0] ?? '';
    task.description = payloads[1] ?? '';
    task.title = payloads[2] ?? '';
    plan.assumptions = [payloads[3] ?? ''];

    const csv = toJiraCsv(plan);
    const cells = parseCsv(csv).flat();

    // The dangerous payloads come back neutralised, as text.
    expect(cells).toContain(`'${payloads[0]}`);
    expect(cells.some((c) => c.startsWith(`'${payloads[1]}`))).toBe(true);
    // No cell anywhere starts with a formula character.
    for (const cell of cells) expect(cell).not.toMatch(/^[=+\-@\t\r]/);
  });

  it('also protects labels and summaries that come from model text', () => {
    const plan = loadFixture();
    const story = plan.stories[0];
    if (story === undefined) throw new Error('fixture is empty');
    story.as_a = '=cmd|calc';
    story.i_want = '@evil';
    for (const cell of parseCsv(toJiraCsv(plan)).flat()) expect(cell).not.toMatch(/^[=+\-@\t\r]/);
  });
});

describe('toJiraCsv on the food-delivery fixture', () => {
  const plan = loadFixture();
  const csv = toJiraCsv(plan);
  const rows = parseCsv(csv);
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const col = (name: string) => header.indexOf(name);

  it('matches the snapshot', () => {
    expect(csv).toMatchSnapshot();
  });

  it('parses back to one row per epic, story and task plus the header', () => {
    expect(body).toHaveLength(plan.epics.length + plan.stories.length + plan.tasks.length);
    for (const r of rows) expect(r).toHaveLength(header.length);
  });

  it('has the documented columns with repeated Labels', () => {
    expect(header.slice(0, 7)).toEqual([
      'Issue Id',
      'Parent Id',
      'Issue Type',
      'Summary',
      'Description',
      'Priority',
      'Story Points',
    ]);
    expect(header.at(-1)).toBe('Blocked By');
    const labels = header.filter((h) => h === 'Labels');
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(header).toHaveLength(7 + labels.length + 1);
  });

  it('orders Epics, then Stories, then Sub-tasks, parents before children', () => {
    const types = body.map((r) => r[col('Issue Type')]);
    const firstStory = types.indexOf('Story');
    const firstTask = types.indexOf('Sub-task');
    expect(types.slice(0, firstStory).every((t) => t === 'Epic')).toBe(true);
    expect(types.slice(firstStory, firstTask).every((t) => t === 'Story')).toBe(true);
    expect(types.slice(firstTask).every((t) => t === 'Sub-task')).toBe(true);
  });

  it('links Issue Id and Parent Id into an Epic -> Story -> Sub-task tree', () => {
    const byId = new Map(body.map((r) => [r[col('Issue Id')], r]));
    expect(byId.size).toBe(body.length);
    for (const r of body) {
      const type = r[col('Issue Type')];
      const parent = r[col('Parent Id')] ?? '';
      if (type === 'Epic') {
        expect(parent).toBe('');
      } else {
        const p = byId.get(parent);
        expect(p, `parent of ${r[col('Summary')]}`).toBeDefined();
        expect(p?.[col('Issue Type')]).toBe(type === 'Story' ? 'Epic' : 'Story');
        expect(Number(parent)).toBeLessThan(Number(r[col('Issue Id')]));
      }
    }
  });

  it('prefixes every summary with its code and puts points on stories and sub-tasks', () => {
    for (const r of body) {
      expect(r[col('Summary')]).toMatch(/^(E|S|T)-\d{3} \S/);
    }
    const task = body.find((r) => r[col('Summary')]?.startsWith('T-001 '));
    expect(task?.[col('Story Points')]).toBe('3');
    const story = body.find((r) => r[col('Summary')]?.startsWith('S-001 '));
    expect(story?.[col('Story Points')]).toBe('16');
    const epic = body.find((r) => r[col('Issue Type')] === 'Epic');
    expect(epic?.[col('Story Points')]).toBe('');
  });

  it('writes story text with acceptance criteria and the layer for tasks', () => {
    const story = body.find((r) => r[col('Summary')]?.startsWith('S-001 '));
    expect(story?.[col('Description')]).toMatch(/^As a hungry customer, I want to search/);
    expect(story?.[col('Description')]).toContain('\n\nAcceptance criteria:\n- ');
    const task = body.find((r) => r[col('Summary')]?.startsWith('T-003 '));
    expect(task?.[col('Description')]).toContain('\n\nLayer: backend');
  });

  it('labels tasks with their R-codes and sprint, and lists blockers as text', () => {
    const labelCols = header.map((h, i) => (h === 'Labels' ? i : -1)).filter((i) => i >= 0);
    for (const t of plan.tasks) {
      const row = body.find((r) => r[col('Summary')]?.startsWith(`${t.id} `));
      expect(row).toBeDefined();
      const labels = labelCols.map((i) => row?.[i] ?? '').filter((l) => l !== '');
      const sprint = plan.schedule.tasks.find((s) => s.task_id === t.id)?.sprint;
      expect(labels).toEqual([...t.requirement_ids, `sprint-${sprint}`]);
      const preds = plan.dependencies
        .filter((d) => d.to === t.id)
        .map((d) => d.from)
        .sort();
      expect(row?.[col('Blocked By')]).toBe(preds.join(', '));
    }
  });
});
