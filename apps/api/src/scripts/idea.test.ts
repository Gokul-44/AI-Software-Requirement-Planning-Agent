import { describe, expect, it } from 'vitest';
import { readIdea, stripCmdCarets } from './idea.js';

const IDEA = 'I want an online food delivery app';

describe('readIdea', () => {
  it('reads --idea as one value or as the words after the flag', () => {
    expect(readIdea({ argv: ['--idea', IDEA] })).toBe(IDEA);
    expect(readIdea({ argv: ['--idea', ...IDEA.split(' ')] })).toBe(IDEA);
    expect(readIdea({ argv: [`--idea=${IDEA}`] })).toBe(IDEA);
    expect(readIdea({ argv: ['--idea', 'An app', 'for farmers', '--other', 'x'] })).toBe(
      'An app for farmers',
    );
  });

  it('reads the idea from a file (a BOM and line breaks are cleaned)', () => {
    const files: Record<string, string> = { 'idea.txt': `\uFEFF${IDEA}\r\n` };
    expect(readIdea({ argv: ['--idea-file', 'idea.txt'], readFile: (p) => files[p] ?? '' })).toBe(
      IDEA,
    );
  });

  it('prefers the file, then the flag, then the IDEA environment variable', () => {
    const readFile = () => 'from file';
    expect(
      readIdea({ argv: ['--idea-file', 'x', '--idea', 'from flag'], env: { IDEA: 'e' }, readFile }),
    ).toBe('from file');
    expect(readIdea({ argv: ['--idea', 'from flag'], env: { IDEA: 'from env' } })).toBe(
      'from flag',
    );
    expect(readIdea({ argv: [], env: { IDEA: 'from env' } })).toBe('from env');
  });

  it('never takes a bare positional argument as the idea', () => {
    expect(readIdea({ argv: [IDEA] })).toBeUndefined();
    expect(readIdea({ argv: [], env: {} })).toBeUndefined();
    expect(readIdea({ argv: ['--idea', '   '] })).toBeUndefined();
  });

  it('repairs the cmd.exe caret escaping seen on Windows', () => {
    expect(readIdea({ argv: ['--idea', '^I^ want^ an^ online^ food^ delivery^ app^'] })).toBe(IDEA);
    expect(stripCmdCarets('^I^ want^ an^ online^ food^ delivery^ app^')).toBe(IDEA);
  });

  it('leaves a legitimate caret alone', () => {
    expect(readIdea({ argv: ['--idea', 'A calculator that shows x^2 and x^3 values'] })).toBe(
      'A calculator that shows x^2 and x^3 values',
    );
  });
});
