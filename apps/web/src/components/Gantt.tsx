import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Schedule } from '@spm/scheduler';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { CRITICAL_COLOR, CRITICAL_STROKE, INK_COLOR } from '../lib/colors';
import { Button } from './ui';
import { formatDays, hoursToDays } from '../lib/format';
import { buildGantt } from '../lib/gantt';
import type { GanttMode } from '../lib/gantt';
import { usePlan } from '../pages/plan/context';

const ROW_H = 28;
const BAR_H = 16;
const BAND_H = 26;
const DAY_H = 22;
const HEADER_H = BAND_H + DAY_H;
const LABEL_W_WIDE = 270;
const LABEL_W_NARROW = 150;
const ZOOM_STEP = 1.35;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;
const MIN_PX_PER_HOUR = 2.6;
const MAX_PX_PER_HOUR = 12;
const FOOTER_H = 22;
const RIGHT_PAD = 48;
const MIN_BAR_PX = 4;

/** Custom SVG Gantt. One scale for both timelines so toggling shows the real difference. */
export function Gantt({ schedule, mode }: { schedule: Schedule; mode: GanttMode }) {
  const { plan, index, selectTask, selectedTaskId } = usePlan();
  const layout = useMemo(() => buildGantt(schedule, mode), [schedule, mode]);
  const [hover, setHover] = useState<{ id: string; left: number; top: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [zoom, setZoom] = useState(1);
  const LABEL_W = containerWidth < 640 ? LABEL_W_NARROW : LABEL_W_WIDE;

  // Fit the chart to the available width; scroll horizontally below the minimum scale.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const focus = plan.run.config.focus_hours_per_day;

  // "Fit" is the scale that fills the box; zoom multiplies it (the box scrolls sideways).
  const fitPx = Math.min(
    MAX_PX_PER_HOUR,
    Math.max(MIN_PX_PER_HOUR, (containerWidth - LABEL_W - RIGHT_PAD) / layout.totalHours),
  );
  const pxPerHour = fitPx * zoom;
  const width = Math.ceil(layout.totalHours * pxPerHour) + RIGHT_PAD;
  const height = HEADER_H + layout.bars.length * ROW_H + FOOTER_H;
  const x = (h: number) => h * pxPerHour;
  const dayStep = focus * 5; // a tick every 5 working days
  const dayTicks = Array.from(
    { length: Math.floor(layout.totalHours / dayStep) + 1 },
    (_, i) => i * dayStep,
  );
  const sched = useMemo(() => new Map(schedule.tasks.map((t) => [t.task_id, t])), [schedule]);

  const track = (e: MouseEvent, id: string) => {
    const c = containerRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const left = Math.min(
      e.clientX - r.left + c.scrollLeft + 14,
      c.scrollLeft + c.clientWidth - 296,
    );
    setHover({
      id,
      left: Math.max(left, c.scrollLeft + 8),
      top: Math.max(e.clientY - r.top + 12, 8),
    });
  };

  const hovered = hover ? index.tasks.get(hover.id) : undefined;
  const hoveredBar = hover ? layout.bars.find((b) => b.taskId === hover.id) : undefined;

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-2">
        <span className="text-xs text-muted tabular-nums">{Math.round(zoom * 100)}%</span>
        <div role="group" aria-label="Zoom" className="flex gap-1">
          <Button
            size="sm"
            aria-label="Zoom out"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))}
          >
            <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            aria-label="Zoom in"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))}
          >
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button size="sm" aria-label="Fit to width" onClick={() => setZoom(1)}>
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            Fit
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative overflow-x-auto rounded-2xl border border-border bg-surface shadow-card"
      >
        <div className="flex" style={{ width: LABEL_W + width }}>
          {/* Task labels */}
          <div
            className="sticky left-0 z-10 shrink-0 border-r border-border bg-surface"
            style={{ width: LABEL_W }}
          >
            <div
              className="flex items-end border-b border-border bg-sand-100 px-3 pb-1.5 text-xs font-semibold tracking-wide text-muted uppercase"
              style={{ height: HEADER_H }}
            >
              Task
            </div>
            {layout.bars.map((b) => {
              const task = index.tasks.get(b.taskId);
              return (
                <button
                  key={b.taskId}
                  type="button"
                  onClick={() => selectTask(b.taskId)}
                  onMouseMove={(e) => track(e, b.taskId)}
                  onMouseLeave={() => setHover(null)}
                  className={clsx(
                    'flex w-full items-center gap-2 px-3 text-left text-xs hover:bg-sand-100',
                    selectedTaskId === b.taskId && 'bg-accent-50',
                  )}
                  style={{ height: ROW_H }}
                  title={task?.title}
                >
                  <span
                    className={clsx(
                      'shrink-0 font-mono font-semibold',
                      b.critical ? 'text-accent-700' : 'text-muted',
                    )}
                  >
                    {b.taskId}
                  </span>
                  <span
                    className={clsx(
                      'truncate',
                      b.critical ? 'font-medium text-text' : 'text-brand-green-800',
                    )}
                  >
                    {task?.title}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Chart */}
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={
              mode === 'sprint'
                ? 'Gantt chart of the capacity-feasible sprint plan'
                : 'Gantt chart of the CPM schedule with unlimited people'
            }
            className="block"
          >
            {/* Sprint bands */}
            {layout.bands.map((band, i) => (
              <g key={band.number}>
                <rect
                  x={x(band.start)}
                  y={0}
                  width={x(band.end - band.start)}
                  height={height}
                  className={i % 2 === 0 ? 'fill-sand-50' : 'fill-surface'}
                />
                <rect
                  x={x(band.start)}
                  y={0}
                  width={x(band.end - band.start)}
                  height={BAND_H}
                  className="fill-sand-200"
                  opacity={i % 2 === 0 ? 1 : 0.6}
                />
                <text
                  x={x(band.start) + 8}
                  y={BAND_H / 2 + 4}
                  className="fill-brand-green-800 text-[11px] font-semibold"
                >
                  Sprint {band.number}
                  {mode === 'cpm' ? ' (reference)' : ''}
                </text>
                <line
                  x1={x(band.start)}
                  x2={x(band.start)}
                  y1={0}
                  y2={height}
                  className="stroke-sand-400"
                />
              </g>
            ))}
            <line x1={0} x2={width} y1={HEADER_H} y2={HEADER_H} className="stroke-sand-300" />

            {/* Day axis */}
            {dayTicks.map((h) => (
              <g key={h}>
                <line
                  x1={x(h)}
                  x2={x(h)}
                  y1={BAND_H}
                  y2={height}
                  className="stroke-sand-300"
                  strokeDasharray="2 4"
                />
                <text x={x(h) + 4} y={BAND_H + DAY_H - 7} className="fill-muted text-[10px]">
                  day {formatDays(hoursToDays(h, focus))}
                </text>
              </g>
            ))}

            {/* Row stripes */}
            {layout.bars.map((b) => (
              <rect
                key={`row-${b.taskId}`}
                x={0}
                y={HEADER_H + b.row * ROW_H}
                width={width}
                height={ROW_H}
                className={clsx(
                  hover?.id === b.taskId
                    ? 'fill-accent-100/60'
                    : b.row % 2 === 1
                      ? 'fill-brand-green-900/[0.04]'
                      : 'fill-transparent',
                )}
              />
            ))}

            {/* Float (slack) after a bar, CPM view only */}
            {layout.bars.map((b) =>
              b.floatEnd !== null && b.floatEnd > b.end ? (
                <rect
                  key={`float-${b.taskId}`}
                  x={x(b.end)}
                  y={HEADER_H + b.row * ROW_H + (ROW_H - BAR_H) / 2 + 4}
                  width={x(b.floatEnd - b.end)}
                  height={BAR_H - 8}
                  rx={2}
                  fill={index.colorOfTask(b.taskId)}
                  opacity={0.18}
                />
              ) : null,
            )}

            {/* Bars */}
            {layout.bars.map((b) => {
              const w = Math.max(MIN_BAR_PX, x(b.end - b.start));
              const y = HEADER_H + b.row * ROW_H + (ROW_H - BAR_H) / 2;
              const color = b.critical ? CRITICAL_COLOR : index.colorOfTask(b.taskId);
              const selected = selectedTaskId === b.taskId;
              return (
                <g
                  key={b.taskId}
                  tabIndex={0}
                  role="button"
                  aria-label={`${b.taskId} ${index.tasks.get(b.taskId)?.title ?? ''}${b.critical ? ', critical' : ''}`}
                  className="cursor-pointer outline-none focus-visible:[&>rect]:stroke-accent-600"
                  onClick={() => selectTask(b.taskId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectTask(b.taskId);
                    }
                  }}
                  onMouseMove={(e) => track(e, b.taskId)}
                  onMouseLeave={() => setHover(null)}
                >
                  <rect
                    x={x(b.start)}
                    y={y}
                    width={w}
                    height={BAR_H}
                    rx={3}
                    fill={color}
                    opacity={1}
                    stroke={selected ? INK_COLOR : b.critical ? CRITICAL_STROKE : 'none'}
                    strokeWidth={selected ? 2 : 1.5}
                  />
                  {w > 34 ? (
                    <text
                      x={x(b.start) + 5}
                      y={y + BAR_H / 2 + 3.5}
                      className="pointer-events-none fill-surface text-[10px] font-semibold"
                    >
                      {b.taskId}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* End markers: where this schedule ends (solid) and where the other one ends (dashed) */}
            {[
              { h: layout.otherEndHours, own: false },
              { h: layout.ownEndHours, own: true },
            ].map(({ h, own }) => {
              const days = formatDays(hoursToDays(h, focus));
              const name =
                (layout.mode === 'sprint') === own
                  ? `Sprint plan ends: day ${days}`
                  : `CPM minimum: day ${days}`;
              const left = x(h) > width - 170;
              return (
                <g key={own ? 'own' : 'other'}>
                  <line
                    x1={x(h)}
                    x2={x(h)}
                    y1={BAND_H}
                    y2={height - FOOTER_H + 4}
                    stroke={own ? INK_COLOR : 'var(--color-brand-green-600)'}
                    strokeWidth={1.5}
                    strokeDasharray={own ? undefined : '5 4'}
                    opacity={own ? 0.5 : 0.9}
                  />
                  <text
                    x={left ? x(h) - 4 : x(h) + 4}
                    y={height - 6}
                    textAnchor={left ? 'end' : 'start'}
                    className={
                      own
                        ? 'fill-brand-green-950 text-[10px] font-semibold'
                        : 'fill-brand-green-700 text-[10px] font-semibold'
                    }
                  >
                    {name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {hover && hovered && hoveredBar ? (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-20 w-72 rounded-xl border border-border bg-surface p-3 text-xs shadow-lift"
            style={{ left: hover.left, top: hover.top }}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-muted">{hovered.id}</span>
              {hoveredBar.critical ? (
                <span className="font-semibold text-accent-700">critical</span>
              ) : null}
            </div>
            <div className="mt-0.5 text-sm font-medium text-text">{hovered.title}</div>
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted">
              <span>
                {hovered.points} pt · {hovered.hours} h
              </span>
              <span>sprint {sched.get(hovered.id)?.sprint}</span>
              <span>
                {mode === 'sprint' ? 'planned' : 'earliest'}: day{' '}
                {formatDays(hoursToDays(hoveredBar.start, focus))} →{' '}
                {formatDays(hoursToDays(hoveredBar.end, focus))}
              </span>
              <span>slack {sched.get(hovered.id)?.slack ?? 0} h</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
