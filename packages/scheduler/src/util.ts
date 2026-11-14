/** Deterministic string order (code units, never locale dependent). */
export function compareCodes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort(compareCodes);
}

/** Binary min-heap with a caller supplied comparator. */
export class MinHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.compare(a[i] as T, a[parent] as T) >= 0) break;
      [a[i], a[parent]] = [a[parent] as T, a[i] as T];
      i = parent;
    }
  }

  pop(): T | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0] as T;
    const last = a.pop() as T;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.compare(a[l] as T, a[m] as T) < 0) m = l;
        if (r < a.length && this.compare(a[r] as T, a[m] as T) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m] as T, a[i] as T];
        i = m;
      }
    }
    return top;
  }
}

/** Sorted adjacency lists over the unique, known nodes. Edges with unknown ends are ignored. */
export interface Adjacency {
  nodes: string[];
  succ: Map<string, string[]>;
  pred: Map<string, string[]>;
}

export function buildAdjacency(
  taskIds: readonly string[],
  edges: readonly { from: string; to: string }[],
): Adjacency {
  const nodes = sortedUnique(taskIds);
  const known = new Set(nodes);
  const succ = new Map<string, string[]>(nodes.map((n) => [n, []]));
  const pred = new Map<string, string[]>(nodes.map((n) => [n, []]));
  const seen = new Set<string>();
  for (const e of edges) {
    if (!known.has(e.from) || !known.has(e.to)) continue;
    const key = `${e.from}\u0000${e.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (succ.get(e.from) as string[]).push(e.to);
    (pred.get(e.to) as string[]).push(e.from);
  }
  for (const list of succ.values()) list.sort(compareCodes);
  for (const list of pred.values()) list.sort(compareCodes);
  return { nodes, succ, pred };
}
