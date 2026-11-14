export type OversizeKind = 'points' | 'hours';

/**
 * Thrown by packSprints when a single task can never fit an empty sprint
 * (points > C or hours > H). The API rejects such configs earlier (INVALID_CONFIG);
 * this is the defensive check that makes an infinite loop impossible (B1, Issue 2).
 */
export class OversizedTaskError extends Error {
  readonly taskId: string;
  readonly kind: OversizeKind;
  readonly value: number;
  readonly limit: number;

  constructor(taskId: string, kind: OversizeKind, value: number, limit: number) {
    const what = kind === 'points' ? 'points' : 'hours';
    super(
      `Task ${taskId} cannot fit in an empty sprint: ${what} ${value} > ${limit}` +
        (kind === 'points' ? ' (sprint capacity C).' : ' (sprint hours H).'),
    );
    this.name = 'OversizedTaskError';
    this.taskId = taskId;
    this.kind = kind;
    this.value = value;
    this.limit = limit;
  }
}

/** Thrown when an algorithm that needs a DAG is called with a cyclic graph. */
export class CycleError extends Error {
  readonly cycles: string[][];

  constructor(cycles: string[][]) {
    super(`The dependency graph contains a cycle: ${cycles.map((c) => c.join(', ')).join(' | ')}`);
    this.name = 'CycleError';
    this.cycles = cycles;
  }
}
