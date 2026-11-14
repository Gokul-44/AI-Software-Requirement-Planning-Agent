import { describe, expect, it } from 'vitest';
import {
  STAGE_OUTPUT_SCHEMAS,
  stageJsonSchema,
  toJsonSchema,
  type LlmStage,
} from '../src/index.js';

type Obj = {
  $schema?: string;
  type?: string;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, Obj>;
  items?: Obj;
  enum?: unknown[];
  pattern?: string;
  minItems?: number;
  maxItems?: number;
};

describe('toJsonSchema', () => {
  it.each(Object.keys(STAGE_OUTPUT_SCHEMAS).map(Number) as LlmStage[])(
    'stage %i converts to draft 2020-12 with strict objects',
    (stage) => {
      const js = stageJsonSchema(stage) as Obj;
      expect(js.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(js.type).toBe('object');
      expect(js.additionalProperties).toBe(false);
    },
  );

  it('matches the C4 shape for stage 1', () => {
    const js = stageJsonSchema(1) as Obj;
    expect(js.required).toEqual(['summary', 'assumptions', 'requirements']);
    const item = js.properties!.requirements!.items!;
    expect(item.required).toEqual(['type', 'text', 'priority']); // category is optional
    expect(item.additionalProperties).toBe(false);
    expect(item.properties!.priority!.enum).toEqual(['must', 'should', 'could']);
    expect(js.properties!.requirements!.minItems).toBe(5);
    expect(js.properties!.requirements!.maxItems).toBe(25);
  });

  it('emits id patterns and the points enum', () => {
    const t4 = stageJsonSchema(4) as Obj;
    const est = t4.properties!.estimates!.items!;
    expect(est.properties!.points!.enum).toEqual([1, 2, 3, 5, 8, 13]);
    expect(est.properties!.task_id!.pattern).toBe('^T-[0-9]{3}$');
    const t7 = stageJsonSchema(7) as Obj;
    expect(t7.properties!.risks!.items!.properties!.signal_ids!.items!.pattern).toBe(
      '^SG-[0-9]{2,3}$',
    );
  });

  it('is usable for any Zod schema', () => {
    expect(toJsonSchema(STAGE_OUTPUT_SCHEMAS[5])).toHaveProperty('properties.dependencies');
  });
});
