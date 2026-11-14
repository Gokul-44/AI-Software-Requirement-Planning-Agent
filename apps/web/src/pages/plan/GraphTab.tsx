import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import type { Edge, Node, NodeProps } from '@xyflow/react';
import clsx from 'clsx';
import { Maximize2, X } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { TaskDetails } from '../../components/TaskDetails';
import { Button, EmptyState, Legend } from '../../components/ui';
import { CRITICAL_COLOR, GRID_COLOR, INK_COLOR, MUTED_EDGE } from '../../lib/colors';
import { NODE_HEIGHT, NODE_WIDTH, isCriticalEdge, layoutGraph } from '../../lib/graphLayout';
import { usePlan } from './context';

type TaskNodeData = {
  taskId: string;
  title: string;
  points: number;
  layer: string;
  critical: boolean;
  color: string;
  selected: boolean;
};
type TaskNode = Node<TaskNodeData, 'task'>;

const TaskNodeView = memo(function TaskNodeView({ data }: NodeProps<TaskNode>) {
  return (
    <div
      className={clsx(
        'rounded-xl border-2 bg-surface px-2.5 py-1.5 shadow-sm transition-shadow',
        data.critical ? 'border-accent-600 bg-accent-50' : 'border-border',
        data.selected && 'ring-2 ring-accent-500 ring-offset-1',
      )}
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        borderLeftWidth: 6,
        borderLeftColor: data.critical ? CRITICAL_COLOR : data.color,
      }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-sand-600" />
      <div className="flex items-center justify-between gap-2">
        <span
          className={clsx(
            'font-mono text-[11px] font-semibold',
            data.critical ? 'text-accent-800' : 'text-muted',
          )}
        >
          {data.taskId}
        </span>
        <span className="text-[11px] text-muted">
          {data.layer} · {data.points} pt
        </span>
      </div>
      <div className="mt-0.5 line-clamp-2 text-xs leading-snug font-medium text-text">
        {data.title}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-sand-600"
      />
    </div>
  );
});

const nodeTypes = { task: TaskNodeView };

export function GraphTab() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}

function GraphInner() {
  const { plan, index, selectedTaskId, selectTask, whatIf } = usePlan();
  const { fitView } = useReactFlow();
  const [criticalOnly, setCriticalOnly] = useState(false);
  const schedule = whatIf.schedule;

  const { nodes, edges } = useMemo(() => {
    const sched = new Map(schedule.tasks.map((t) => [t.task_id, t]));
    const shown = plan.tasks.filter((t) => !criticalOnly || sched.get(t.id)?.critical);
    const ids = new Set(shown.map((t) => t.id));
    const deps = plan.dependencies.filter((d) => ids.has(d.from) && ids.has(d.to));
    const positions = layoutGraph(
      shown.map((t) => t.id),
      deps,
    );
    const nodes: TaskNode[] = shown.map((t) => ({
      id: t.id,
      type: 'task',
      position: { x: positions.get(t.id)?.x ?? 0, y: positions.get(t.id)?.y ?? 0 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      draggable: false,
      connectable: false,
      data: {
        taskId: t.id,
        title: t.title,
        points: t.points,
        layer: t.layer,
        critical: sched.get(t.id)?.critical ?? false,
        color: index.colorOfTask(t.id),
        selected: t.id === selectedTaskId,
      },
    }));
    const edges: Edge[] = deps.map((d) => {
      const a = sched.get(d.from);
      const b = sched.get(d.to);
      const critical = a && b ? isCriticalEdge(a, b) : false;
      const touchesSelected =
        selectedTaskId !== null && (d.from === selectedTaskId || d.to === selectedTaskId);
      const color = critical ? CRITICAL_COLOR : touchesSelected ? INK_COLOR : MUTED_EDGE;
      return {
        id: `${d.from}->${d.to}`,
        source: d.from,
        target: d.to,
        type: 'smoothstep',
        zIndex: critical ? 10 : touchesSelected ? 5 : 0,
        style: { stroke: color, strokeWidth: critical ? 2.75 : touchesSelected ? 2.25 : 1.25 },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      };
    });
    return { nodes, edges };
  }, [plan.tasks, plan.dependencies, schedule, criticalOnly, selectedTaskId, index]);

  // Re-fit when the set of visible nodes changes (filter toggled).
  useEffect(() => {
    const t = setTimeout(() => void fitView({ padding: 0.12, duration: 250 }), 50);
    return () => clearTimeout(t);
  }, [criticalOnly, fitView]);

  const criticalCount = schedule.tasks.filter((t) => t.critical).length;

  if (plan.tasks.length === 0) return <EmptyState title="No tasks to draw" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-brand-green-800">
            <input
              type="checkbox"
              checked={criticalOnly}
              onChange={(e) => setCriticalOnly(e.target.checked)}
              className="h-4 w-4 rounded border-sand-400 accent-accent-600"
            />
            Critical path only ({criticalCount} tasks)
          </label>
          <Button size="sm" onClick={() => void fitView({ padding: 0.12, duration: 300 })}>
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            Fit view
          </Button>
        </div>
        <Legend
          items={[
            { color: CRITICAL_COLOR, label: 'Critical path' },
            ...plan.epics.map((e) => ({ color: index.colorOfEpic(e.id), label: e.title })),
          ]}
        />
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
        style={{ height: 'clamp(30rem, calc(100dvh - 18rem), 100rem)' }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.1}
          maxZoom={1.6}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          onNodeClick={(_, node) => selectTask(node.id)}
          onPaneClick={() => selectTask(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color={GRID_COLOR} />
          <Controls showInteractive={false} />
          {selectedTaskId ? null : (
            <MiniMap
              pannable
              className="!hidden sm:!block"
              zoomable
              nodeColor={(n) =>
                (n.data as TaskNodeData).critical ? CRITICAL_COLOR : (n.data as TaskNodeData).color
              }
              nodeStrokeWidth={0}
              bgColor="var(--color-sand-100)"
            />
          )}
        </ReactFlow>

        {selectedTaskId ? (
          <aside
            aria-label="Task details"
            className="spm-slide-in absolute top-0 right-0 bottom-0 hidden w-[360px] flex-col border-l border-border bg-surface shadow-lift lg:flex"
          >
            <div className="flex items-center justify-between border-b border-sand-200 px-4 py-2">
              <span className="text-sm font-semibold text-brand-green-800">Task details</span>
              <Button size="sm" variant="ghost" onClick={() => selectTask(null)}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Close
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <TaskDetails taskId={selectedTaskId} />
            </div>
          </aside>
        ) : (
          <div className="pointer-events-none absolute top-3 left-3 rounded-xl border border-border bg-surface/90 px-3 py-2 text-xs text-muted shadow-sm">
            <span className="font-medium text-text">Click a node</span> for its estimate, schedule
            and dependencies. Arrows point to the tasks that wait.
          </div>
        )}
      </div>
    </div>
  );
}
