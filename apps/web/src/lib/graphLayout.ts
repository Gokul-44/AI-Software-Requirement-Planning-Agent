import dagre from '@dagrejs/dagre';

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 76;

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

/** Left-to-right layered layout. Positions are node top-left corners (React Flow convention). */
export function layoutGraph(
  nodeIds: string[],
  edges: { from: string; to: string }[],
): Map<string, LayoutNode> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 90, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(nodeIds);
  for (const id of nodeIds) g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) if (ids.has(e.from) && ids.has(e.to)) g.setEdge(e.from, e.to);
  dagre.layout(g);
  const out = new Map<string, LayoutNode>();
  for (const id of nodeIds) {
    const n = g.node(id);
    out.set(id, { id, x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 });
  }
  return out;
}

/** An edge is critical when both ends are critical and the successor starts right at the finish. */
export function isCriticalEdge(
  from: { critical: boolean; ef: number },
  to: { critical: boolean; es: number },
): boolean {
  return from.critical && to.critical && from.ef === to.es;
}
