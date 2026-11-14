import { CycleError } from './errors.js';
import type { Edge } from './types.js';
import { buildAdjacency, compareCodes } from './util.js';
import type { Adjacency } from './util.js';

export type AcyclicResult =
  | { ok: true; order: string[] }
  | {
      ok: false;
      /** Exactly the strongly connected components that are cycles, each sorted by code. */
      cycles: string[][];
      /** One concrete closed path per cycle, for display: [A, B, C, A]. */
      cyclePaths: string[][];
      /** Nodes that Kahn could not emit only because a cycle is upstream of them. */
      blocked: string[];
    };

/** Plain FIFO Kahn over sorted adjacency. Returns the emitted order L. */
function kahn(adj: Adjacency): string[] {
  const indeg = new Map<string, number>();
  for (const n of adj.nodes) indeg.set(n, (adj.pred.get(n) as string[]).length);
  const queue = adj.nodes.filter((n) => indeg.get(n) === 0);
  const order: string[] = [];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head] as string;
    order.push(u);
    for (const v of adj.succ.get(u) as string[]) {
      const d = (indeg.get(v) as number) - 1;
      indeg.set(v, d);
      if (d === 0) queue.push(v);
    }
  }
  return order;
}

/** Iterative Tarjan SCC restricted to `members`. Components come out in discovery order. */
function tarjan(members: string[], succ: Map<string, string[]>): string[][] {
  const inSet = new Set(members);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  for (const root of members) {
    if (index.has(root)) continue;
    const frames: { node: string; next: number }[] = [{ node: root, next: 0 }];
    index.set(root, counter);
    low.set(root, counter);
    counter++;
    stack.push(root);
    onStack.add(root);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1] as { node: string; next: number };
      const out = succ.get(frame.node) as string[];
      if (frame.next < out.length) {
        const w = out[frame.next++] as string;
        if (!inSet.has(w)) continue;
        if (!index.has(w)) {
          index.set(w, counter);
          low.set(w, counter);
          counter++;
          stack.push(w);
          onStack.add(w);
          frames.push({ node: w, next: 0 });
        } else if (onStack.has(w)) {
          low.set(frame.node, Math.min(low.get(frame.node) as number, index.get(w) as number));
        }
      } else {
        frames.pop();
        const parent = frames[frames.length - 1];
        if (parent !== undefined) {
          low.set(
            parent.node,
            Math.min(low.get(parent.node) as number, low.get(frame.node) as number),
          );
        }
        if (low.get(frame.node) === index.get(frame.node)) {
          const scc: string[] = [];
          for (;;) {
            const w = stack.pop() as string;
            onStack.delete(w);
            scc.push(w);
            if (w === frame.node) break;
          }
          sccs.push(scc);
        }
      }
    }
  }
  return sccs;
}

/** Shortest closed path through `start` inside one SCC (BFS), as [start, ..., last, start]. */
function cyclePathThrough(start: string, scc: Set<string>, succ: Map<string, string[]>): string[] {
  const parent = new Map<string, string>();
  const visited = new Set<string>([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head] as string;
    for (const w of succ.get(u) as string[]) {
      if (!scc.has(w)) continue;
      if (w === start) {
        const path = [u];
        while (path[0] !== start) path.unshift(parent.get(path[0] as string) as string);
        return [...path, start];
      }
      if (!visited.has(w)) {
        visited.add(w);
        parent.set(w, u);
        queue.push(w);
      }
    }
  }
  // Unreachable for a real SCC; keeps the function total.
  return [start, start];
}

/**
 * B4.2. Kahn is the fast acyclicity test (|L| = |V|). If it fails, Tarjan runs on V \ L and
 * every SCC that is a real cycle (size > 1, or a self-loop) is reported with one concrete
 * cycle path. The remaining nodes of V \ L are `blocked`: downstream of a cycle, not in it.
 * The output depends only on the graph, never on the order of the inputs.
 */
export function checkAcyclic(taskIds: readonly string[], edges: readonly Edge[]): AcyclicResult {
  const adj = buildAdjacency(taskIds, edges);
  const order = kahn(adj);
  if (order.length === adj.nodes.length) return { ok: true, order };

  const emitted = new Set(order);
  const rest = adj.nodes.filter((n) => !emitted.has(n));
  const cycles: string[][] = [];
  for (const scc of tarjan(rest, adj.succ)) {
    const first = scc[0] as string;
    const selfLoop = scc.length === 1 && (adj.succ.get(first) as string[]).includes(first);
    if (scc.length > 1 || selfLoop) cycles.push(scc.sort(compareCodes));
  }
  cycles.sort((a, b) => compareCodes(a[0] as string, b[0] as string));

  const inCycle = new Set(cycles.flat());
  const blocked = rest.filter((n) => !inCycle.has(n));
  const cyclePaths = cycles.map((c) => cyclePathThrough(c[0] as string, new Set(c), adj.succ));
  return { ok: false, cycles, cyclePaths, blocked };
}

/** Number of transitive descendants of every task. Throws CycleError on a cyclic graph. */
export function descendantCounts(
  taskIds: readonly string[],
  edges: readonly Edge[],
): Record<string, number> {
  const adj = buildAdjacency(taskIds, edges);
  const acyclic = checkAcyclic(taskIds, edges);
  if (!acyclic.ok) throw new CycleError(acyclic.cycles);

  const order = acyclic.order;
  const slot = new Map(order.map((id, i) => [id, i]));
  const words = Math.ceil(order.length / 32);
  const sets = new Map<string, Uint32Array>();
  const counts: Record<string, number> = {};

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i] as string;
    const bits = new Uint32Array(words);
    for (const w of adj.succ.get(id) as string[]) {
      const child = sets.get(w) as Uint32Array;
      for (let k = 0; k < words; k++) bits[k] = (bits[k] as number) | (child[k] as number);
      const j = slot.get(w) as number;
      bits[j >> 5] = (bits[j >> 5] as number) | (1 << (j & 31));
    }
    sets.set(id, bits);
    let count = 0;
    for (let k = 0; k < words; k++) {
      let x = bits[k] as number;
      while (x !== 0) {
        x &= x - 1;
        count++;
      }
    }
    counts[id] = count;
  }
  return counts;
}
