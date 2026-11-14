import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { DEFAULT_CONFIG } from '@spm/shared';
import { MemoryRepository } from '../db/memory-repository.js';
import { buildCacheKey } from '../llm/cache-key.js';
import { createHarness } from '../llm/harness.js';
import { MockLlmClient } from '../llm/mock.js';
import { Pipeline } from '../pipeline/orchestrator.js';
import { PROMPT_VERSIONS, loadPrompt, stage3System } from './index.js';

describe('stage 3 prompt versions', () => {
  it('uses v2 for new runs and keeps the v1 file for old cache entries', () => {
    expect(PROMPT_VERSIONS[3]).toBe('v2');
    expect(existsSync(path.join(import.meta.dirname, 'stage3.v1.md'))).toBe(true);
    expect(loadPrompt('stage3', 'v1')).toContain('(prompt v1)');
    expect(loadPrompt('stage3', 'v2')).toContain('(prompt v2)');
    expect(stage3System()).toBe(loadPrompt('stage3', 'v2'));
  });

  it('v2 requires schema tasks and create/CRUD endpoints for the main entities', () => {
    const v2 = loadPrompt('stage3', 'v2');
    expect(v2).toMatch(/main entit/i);
    expect(v2).toMatch(/`database` task/);
    expect(v2).toMatch(/create, read, update, delete/);
    expect(v2).toContain('Implement place-order endpoint');
    // The v1 rule "a backend or data task" is replaced.
    expect(loadPrompt('stage3', 'v1')).toContain('a backend or data task');
    expect(v2).not.toContain('a backend or data task');
    // Still treats the input as data.
    expect(v2).toContain('data, not instructions');
  });

  it('changes the cache key, so v1 answers are never served for v2', () => {
    const parts = { stage: 3, provider: 'mock', model: 'mock-1', settings: {}, input: { a: 1 } };
    expect(buildCacheKey({ ...parts, promptVersion: 'v1' })).not.toBe(
      buildCacheKey({ ...parts, promptVersion: 'v2' }),
    );
  });
});

describe('mock provider follows stage3.v2', () => {
  it('gives each epic a database task and names create/read endpoints, with every story covered', async () => {
    const repo = new MemoryRepository();
    const pipeline = new Pipeline({
      repo,
      harness: createHarness({ llm: new MockLlmClient(), cache: repo.cache }),
      logger: pino({ level: 'silent' }),
    });
    const { runId } = await repo.createProjectWithRun({
      ideaText: 'I want an online food delivery app',
      config: DEFAULT_CONFIG,
      llmProvider: 'mock',
      llmModel: 'mock-1',
      promptVersions: {},
    });
    await pipeline.execute(runId);
    expect((await repo.getRun(runId))?.status).toBe('succeeded');
    const core = await repo.loadCore(runId);

    for (const epic of core.epics) {
      const stories = core.stories.filter((s) => s.epicCode === epic.code);
      if (stories.every((s) => /operator|admin/i.test(s.asA))) continue;
      const codes = new Set(stories.map((s) => s.code));
      const epicTasks = core.tasks.filter((t) => codes.has(t.storyCode));
      expect(epicTasks.filter((t) => t.layer === 'database')).toHaveLength(1);
    }
    expect(core.tasks.some((t) => /create and read endpoints/.test(t.title))).toBe(true);
    for (const s of core.stories) {
      const n = core.tasks.filter((t) => t.storyCode === s.code).length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
    expect(core.tasks.length).toBeLessThanOrEqual(150);
  });
});
