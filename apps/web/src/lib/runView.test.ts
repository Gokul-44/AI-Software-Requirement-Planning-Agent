import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RunErrorPanel } from '../components/RunErrorPanel';
import { attemptLabel, runView } from './runView';

describe('runView', () => {
  it('a failed run looks failed: its own heading, no clock, no refresh note, no preview', () => {
    const v = runView('failed');
    expect(v.heading).toBe('The run stopped');
    expect(v.showClock).toBe(false);
    expect(v.showRefreshNote).toBe(false);
    expect(v.showPlanPreview).toBe(false);
    expect(v.failed).toBe(true);
  });

  it('a running run keeps the progress wording and the refresh note', () => {
    for (const s of ['queued', 'running'] as const) {
      const v = runView(s);
      expect(v.heading).toBe('Building your plan');
      expect(v.showClock).toBe(true);
      expect(v.showRefreshNote).toBe(true);
      expect(v.showPlanPreview).toBe(true);
    }
  });

  it('a run waiting for a decision does not poll, and a finished run says it is ready', () => {
    expect(runView('needs_resolution').showRefreshNote).toBe(false);
    expect(runView('succeeded').heading).toBe('Your plan is ready');
    expect(runView('succeeded').showRefreshNote).toBe(false);
  });
});

describe('attemptLabel', () => {
  it('calls the per-epic calls of stage 3 "model calls" and other stages "attempts"', () => {
    expect(attemptLabel(3, 6)).toBe('6 model calls');
    expect(attemptLabel(3, 1)).toBe('1 model call');
    expect(attemptLabel(2, 2)).toBe('2 attempts');
    expect(attemptLabel(1, 1)).toBe('1 attempt');
  });
});

function render(error: Parameters<typeof RunErrorPanel>[0]['error']): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(
        MemoryRouter,
        null,
        createElement(RunErrorPanel, {
          error,
          onRetry: () => undefined,
          onNewRun: () => undefined,
        }),
      ),
    ),
  );
}

describe('RunErrorPanel', () => {
  it('a used-up quota offers a sample plan and a retry from the failed stage, not a new run', () => {
    const html = render({
      stage: 3,
      code: 'STAGE_FAILED',
      message: 'Gemini API error 429: quota',
      details: { code: 'QUOTA_EXHAUSTED' },
    });
    expect(html).toContain('The free AI quota is used up right now');
    expect(html).toContain('Open a sample plan');
    expect(html).toContain('Retry from stage 3');
    expect(html).not.toContain('Start a new run');
    expect(html).toContain('role="alert"');
    // The raw provider message sits inside a collapsed <details>.
    expect(html).toMatch(/<details[^>]*>.*Gemini API error 429: quota/s);
  });

  it('another stage failure offers the retry first, then a new run', () => {
    const html = render({
      stage: 5,
      code: 'STAGE_FAILED',
      message: 'Invalid output',
      details: { code: 'VALIDATION_FAILED' },
    });
    expect(html).toContain('Stage 5 failed');
    expect(html).toContain('Retry from stage 5');
    expect(html).toContain('Start a new run');
    expect(html).not.toContain('quota is used up');
    expect(html.indexOf('Retry from stage 5')).toBeLessThan(html.indexOf('Start a new run'));
  });
});
