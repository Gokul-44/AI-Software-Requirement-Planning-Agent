import type { CycleInfo } from '../api/types';

export interface EdgeRef {
  from: string;
  to: string;
}

export const edgeKey = (e: EdgeRef): string => `${e.from}->${e.to}`;

/** True when the edges that remain after removing `removed` still contain a directed cycle. */
export function stillCyclic(edges: EdgeRef[], removed: Set<string>): boolean {
  const kept = edges.filter((e) => !removed.has(edgeKey(e)));
  const indegree = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const e of kept) {
    indegree.set(e.from, indegree.get(e.from) ?? 0);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  }
  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  let seen = 0;
  while (queue.length > 0) {
    const id = queue.pop();
    if (id === undefined) break;
    seen += 1;
    for (const next of out.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return seen < indegree.size;
}

export interface CycleNode {
  id: string;
  x: number;
  y: number;
}

export interface CycleLayout {
  width: number;
  height: number;
  nodes: CycleNode[];
}

const R_MIN = 62;
const PAD = 52;

/** Connected components of the cycle's tasks (each is one loop group), by union-find. */
export function cycleComponents(cycle: CycleInfo): string[][] {
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let root = a;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) ?? root;
    return root;
  };
  for (const id of cycle.task_ids) parent.set(id, id);
  for (const e of cycle.edges) {
    parent.set(find(e.from), find(e.to));
  }
  const groups = new Map<string, string[]>();
  for (const id of cycle.task_ids) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  return [...groups.values()];
}

/** Places each loop group on its own circle, circles side by side. */
export function layoutCycle(cycle: CycleInfo): CycleLayout {
  const groups = cycleComponents(cycle);
  const nodes: CycleNode[] = [];
  let cursor = 0;
  let height = 0;
  for (const group of groups) {
    const r = Math.max(R_MIN, group.length * 16);
    const cx = cursor + r + PAD;
    const cy = r + PAD;
    group.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / group.length - Math.PI / 2;
      nodes.push({ id, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    });
    cursor = cx + r + PAD;
    height = Math.max(height, 2 * (r + PAD));
  }
  return { width: Math.max(cursor, 1), height: Math.max(height, 1), nodes };
}
