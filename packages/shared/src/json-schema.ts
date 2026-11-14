import { z } from 'zod';
import { STAGE_OUTPUT_SCHEMAS, type LlmStage } from './stages.js';

export type JsonSchema = Record<string, unknown>;

/**
 * Converts a Zod schema to JSON Schema draft 2020-12 using Zod 4's built-in `z.toJSONSchema`
 * (installed version: zod ^4.6.7). Cross-field refinements (superRefine) cannot be expressed in
 * JSON Schema and are skipped, which is why Zod must still validate after parsing.
 * Strict objects are emitted with `additionalProperties: false`.
 */
export function toJsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'throw',
  }) as JsonSchema;
}

/** JSON Schema for one LLM stage output (stages 1, 2, 3, 4, 5, 7). */
export function stageJsonSchema(stage: LlmStage): JsonSchema {
  return toJsonSchema(STAGE_OUTPUT_SCHEMAS[stage]);
}
