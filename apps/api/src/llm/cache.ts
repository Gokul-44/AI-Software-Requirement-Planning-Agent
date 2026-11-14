/** stage_cache row (design document C2): the validated LLM output, pre-stamping. */
export interface StageCacheEntry {
  cacheKey: string;
  stage: number;
  promptVersion: string;
  llmModel: string;
  output: unknown;
  inputTokens: number;
  outputTokens: number;
}

export interface StageCacheStore {
  get(cacheKey: string): Promise<StageCacheEntry | null>;
  put(entry: StageCacheEntry): Promise<void>;
}
