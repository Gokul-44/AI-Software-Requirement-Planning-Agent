import clsx from 'clsx';
import { AlertTriangle, Scissors } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { errorMessage } from '../api/errors';
import { useResolveCycle } from '../api/hooks';
import type { CycleInfo } from '../api/types';
import { edgeKey, layoutCycle, stillCyclic } from '../lib/cycle';
import { Button, ErrorState } from './ui';
import { useToast } from './toastContext';

const NODE_W = 58;
const NODE_H = 26;

/** A point on the box around a node, towards (tx, ty). */
function onBox(cx: number, cy: number, tx: number, ty: number): { x: number; y: number } {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.min(
    dx === 0 ? Infinity : NODE_W / 2 / Math.abs(dx),
    dy === 0 ? Infinity : NODE_H / 2 / Math.abs(dy),
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function CycleGraph({
  cycle,
  removed,
  onToggle,
}: {
  cycle: CycleInfo;
  removed: Set<string>;
  onToggle: (key: string) => void;
}) {
  const layout = useMemo(() => layoutCycle(cycle), [cycle]);
  const pos = new Map(layout.nodes.map((n) => [n.id, n]));
  const markerId = useId().replace(/:/g, '');

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={`Dependency cycle between ${cycle.task_ids.join(', ')}`}
      className="mx-auto h-auto max-h-[320px] w-full"
    >
      <defs>
        <marker
          id={`${markerId}-keep`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" className="fill-accent-600" />
        </marker>
        <marker
          id={`${markerId}-cut`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" className="fill-red-700" />
        </marker>
      </defs>
      {cycle.edges.map((e) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) return null;
        const start = onBox(a.x, a.y, b.x, b.y);
        const end = onBox(b.x, b.y, a.x, a.y);
        // Bend each edge sideways, so two opposite edges do not overlap.
        const mx = (start.x + end.x) / 2;
        const my = (start.y + end.y) / 2;
        const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
        const cx = mx + (-(end.y - start.y) / len) * 16;
        const cy = my + ((end.x - start.x) / len) * 16;
        const key = edgeKey(e);
        const cut = removed.has(key);
        const d = `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`;
        return (
          <g key={key} className="cursor-pointer" onClick={() => onToggle(key)}>
            <path d={d} fill="none" stroke="transparent" strokeWidth="14" />
            <path
              d={d}
              fill="none"
              strokeWidth={cut ? 2.5 : 3}
              strokeDasharray={cut ? '6 5' : undefined}
              markerEnd={`url(#${markerId}-${cut ? 'cut' : 'keep'})`}
              className={cut ? 'stroke-red-700' : 'stroke-accent-600'}
            />
          </g>
        );
      })}
      {layout.nodes.map((n) => (
        <g key={n.id}>
          <rect
            x={n.x - NODE_W / 2}
            y={n.y - NODE_H / 2}
            width={NODE_W}
            height={NODE_H}
            rx={13}
            className="fill-brand-green-900 stroke-sand-300"
            strokeWidth="1.5"
          />
          <text
            x={n.x}
            y={n.y + 4}
            textAnchor="middle"
            className="fill-sand-100 font-mono text-[11px] font-semibold"
          >
            {n.id}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * Shown when a run is `needs_resolution`: the loop(s) as a small graph, a checkbox per edge, and
 * the button that POSTs resolve-cycle. Polling continues afterwards (the run is running again).
 */
export function CycleResolver({ runId, cycle }: { runId: string; cycle: CycleInfo }) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const resolve = useResolveCycle(runId);
  const { toast } = useToast();

  const toggle = (key: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const leftover = removed.size > 0 && stillCyclic(cycle.edges, removed);

  function submit() {
    resolve.mutate(
      { remove_edges: cycle.edges.filter((e) => removed.has(edgeKey(e))) },
      {
        onSuccess: () => {
          setRemoved(new Set());
          toast('success', 'Dependencies updated', 'The run continues with scheduling.');
        },
        onError: (e) => toast('error', 'Could not resolve the cycle', errorMessage(e)),
      },
    );
  }

  return (
    <section
      aria-labelledby="cycle-title"
      className="rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="cycle-title" className="text-lg font-semibold text-amber-950">
            The dependency graph has a loop
          </h2>
          <p className="mt-1 text-sm text-amber-950">
            Tasks {cycle.task_ids.join(', ')} wait for each other, so no order exists. The model was
            asked to repair it once and could not. Tick the dependency (or dependencies) to remove;
            one edge per loop is enough. Every removal is logged on the Issues tab.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-[1.2fr_1fr] md:items-center">
        <div className="rounded-2xl border border-amber-200 bg-surface p-3">
          <CycleGraph cycle={cycle} removed={removed} onToggle={toggle} />
          <p className="mt-1 text-center text-xs text-muted">
            An arrow means "must finish before". Purple edges stay; red dashed edges are removed.
          </p>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold text-amber-950">Edges in the loop</legend>
          <ul className="mt-2 space-y-2">
            {cycle.edges.map((e) => {
              const key = edgeKey(e);
              const id = `edge-${key}`;
              return (
                <li key={key}>
                  <label
                    htmlFor={id}
                    className={clsx(
                      'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors',
                      removed.has(key)
                        ? 'border-red-300 bg-red-50 text-red-900'
                        : 'border-amber-200 bg-surface text-text hover:bg-sand-100',
                    )}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={removed.has(key)}
                      onChange={() => toggle(key)}
                      className="h-4 w-4 accent-red-700"
                    />
                    <span className="font-mono text-xs font-semibold">
                      {e.from} → {e.to}
                    </span>
                    <span className="ml-auto text-xs text-muted">
                      {removed.has(key) ? 'remove' : 'keep'}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {leftover ? (
            <p role="status" className="mt-2 text-xs text-amber-950">
              A loop would remain with these edges. You can continue; the run will ask again.
            </p>
          ) : null}
          <Button
            variant="primary"
            className="mt-4 w-full sm:w-auto"
            disabled={removed.size === 0 || resolve.isPending}
            onClick={submit}
          >
            <Scissors className="h-4 w-4" aria-hidden="true" />
            {resolve.isPending ? 'Updating…' : 'Remove selected and continue'}
          </Button>
        </fieldset>
      </div>
      {resolve.isError ? (
        <div className="mt-4">
          <ErrorState error={resolve.error} />
        </div>
      ) : null}
    </section>
  );
}
