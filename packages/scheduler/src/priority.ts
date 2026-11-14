import { CycleError } from './errors.js';
import { checkAcyclic, descendantCounts } from './graph.js';
import type { CpmResult, Edge } from './types.js';
import { MinHeap, buildAdjacency, compareCodes } from './util.js';

/**
 * Priority-queue Kahn (B1 Issue 5). Among tasks whose predecessors are all emitted, the next
 * one is the smallest by (slack ascending, descendant count descending, code ascending):
 * critical work first, then work that unblocks the most, then a deterministic tie-break.
 * The result is a topological order and does not depend on the order of the inputs.
 */
export function priorityOrder(
  taskIds: readonly string[],
  edges: readonly Edge[],
  cpm: CpmResult,
): string[] {
  const acyclic = checkAcyclic(taskIds, edges);
  if (!acyclic.ok) throw new CycleError(acyclic.cycles);

  const adj = buildAdjacency(taskIds, edges);
  const descendants = descendantCounts(taskIds, edges);
  const slackOf = (id: string): number => {
    const t = cpm.tasks[id];
    if (t === undefined) throw new RangeError(`Task ${id} has no CPM result.`);
    return t.slack;
  };

  const heap = new MinHeap<string>((a, b) => {
    const bySlack = slackOf(a) - slackOf(b);
    if (bySlack !== 0) return bySlack;
    const byFanout = (descendants[b] as number) - (descendants[a] as number);
    if (byFanout !== 0) return byFanout;
    return compareCodes(a, b);
  });

  const remaining = new Map<string, number>();
  for (const n of adj.nodes) {
    const d = (adj.pred.get(n) as string[]).length;
    remaining.set(n, d);
    if (d === 0) heap.push(n);
  }

  const order: string[] = [];
  for (let u = heap.pop(); u !== undefined; u = heap.pop()) {
    order.push(u);
    for (const v of adj.succ.get(u) as string[]) {
      const d = (remaining.get(v) as number) - 1;
      remaining.set(v, d);
      if (d === 0) heap.push(v);
    }
  }
  return order;
}
