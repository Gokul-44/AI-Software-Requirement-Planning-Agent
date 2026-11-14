import type { Issue } from '@spm/shared';
import type { Edge } from './types.js';

/** Stage of the pipeline that owns edge validation (stage 5: dependencies). */
const DEPENDENCY_STAGE = 5;

function issueId(n: number): string {
  return `I-${String(n).padStart(3, '0')}`;
}

/**
 * B4.1: drops and reports edges with an unknown end (`unknown_reference`), a self-loop
 * (`self_loop`) or a repeated (from, to) pair (`duplicate_edge`). O(E) with a hash set.
 * Edges keep their extra fields; the first copy of a duplicate wins. Issue ids count up
 * from `firstIssueNumber` (the caller renumbers if it merges issue lists).
 */
export function validateEdges<E extends Edge>(
  taskIds: readonly string[],
  edges: readonly E[],
  firstIssueNumber = 1,
): { edges: E[]; issues: Issue[] } {
  const known = new Set(taskIds);
  const seen = new Set<string>();
  const kept: E[] = [];
  const issues: Issue[] = [];
  let next = firstIssueNumber;

  const drop = (kind: Issue['kind'], e: E, message: string) => {
    issues.push({
      id: issueId(next++),
      stage: DEPENDENCY_STAGE,
      severity: 'warning',
      kind,
      message,
      refs: [e.from, e.to],
      resolution: 'Edge removed.',
    });
  };

  for (const e of edges) {
    const missing = [e.from, e.to].filter((id) => !known.has(id));
    if (missing.length > 0) {
      const names = [...new Set(missing)].map((m) => `"${m}"`).join(' and ');
      drop(
        'unknown_reference',
        e,
        `Dependency ${e.from} -> ${e.to} dropped: ${names} is not a task.`,
      );
      continue;
    }
    if (e.from === e.to) {
      drop(
        'self_loop',
        e,
        `Dependency ${e.from} -> ${e.to} dropped: a task cannot depend on itself.`,
      );
      continue;
    }
    const key = `${e.from}\u0000${e.to}`;
    if (seen.has(key)) {
      drop(
        'duplicate_edge',
        e,
        `Dependency ${e.from} -> ${e.to} dropped: it is listed more than once.`,
      );
      continue;
    }
    seen.add(key);
    kept.push(e);
  }
  return { edges: kept, issues };
}
