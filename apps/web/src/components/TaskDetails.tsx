import { useMemo } from 'react';
import { usePlan } from '../pages/plan/context';
import { formatDays, hoursToDays } from '../lib/format';
import { CriticalBadge, IdChip, LayerBadge, PriorityBadge, SeverityBadge } from './ui';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-text tabular-nums">{children}</dd>
    </div>
  );
}

/** Everything the plan knows about one task. Used by the drawer and the graph's side panel. */
export function TaskDetails({ taskId }: { taskId: string }) {
  const { plan, index, whatIf, selectTask } = usePlan();
  const task = index.tasks.get(taskId);
  const sched = index.schedule.get(taskId);
  const scenarioSprint = useMemo(
    () => whatIf.schedule.tasks.find((t) => t.task_id === taskId)?.sprint,
    [whatIf.schedule, taskId],
  );
  if (!task) return <p className="text-sm text-muted">Task {taskId} was not found.</p>;

  const story = index.stories.get(task.story_id);
  const epic = index.epicOfTask.get(task.id);
  const perDay = plan.run.config.focus_hours_per_day;
  const preds = index.predecessors.get(taskId) ?? [];
  const succs = index.successors.get(taskId) ?? [];
  const signals = plan.signals.filter((s) => s.task_ids.includes(taskId));
  const reqs = task.requirement_ids
    .map((id) => index.requirements.get(id))
    .filter((r) => r !== undefined);
  const chip = (id: string) => (
    <IdChip
      key={id}
      id={id}
      critical={index.criticalIds.has(id)}
      title={index.tasks.get(id)?.title}
      onClick={() => selectTask(id)}
    />
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-muted">{task.id}</span>
          <LayerBadge layer={task.layer} />
          {sched?.critical ? <CriticalBadge /> : null}
        </div>
        <h3 className="mt-1.5 text-lg leading-snug font-semibold text-text">{task.title}</h3>
        {epic ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: index.colorOfEpic(epic.id) }}
            />
            {epic.id} {epic.title}
            {story ? ` · ${story.id}` : ''}
          </p>
        ) : null}
      </div>

      <p className="text-sm text-brand-green-800">{task.description}</p>

      <section>
        <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Estimate</h4>
        <dl className="divide-y divide-sand-200">
          <Row label="Story points">{task.points}</Row>
          <Row label="Hours">
            {task.hours} h
            <span className="ml-1 font-normal text-muted">
              ({formatDays(hoursToDays(task.hours, perDay))} d)
            </span>
          </Row>
        </dl>
        <p className="mt-1 text-xs text-muted">{task.estimate_rationale}</p>
      </section>

      {sched ? (
        <section>
          <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Schedule (CPM, unlimited people)
          </h4>
          <dl className="divide-y divide-sand-200">
            <Row label="Earliest start / finish">
              {sched.es} h → {sched.ef} h
            </Row>
            <Row label="Latest start / finish">
              {sched.ls} h → {sched.lf} h
            </Row>
            <Row label="Slack">
              <span className={sched.slack === 0 ? 'font-semibold text-accent-700' : ''}>
                {sched.slack} h
              </span>
            </Row>
            <Row label="Downstream tasks">{sched.descendants}</Row>
            <Row label={whatIf.isScenario ? 'Sprint (what-if scenario)' : 'Sprint (capacity plan)'}>
              {scenarioSprint ?? sched.sprint}
            </Row>
          </dl>
        </section>
      ) : null}

      <section>
        <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
          Depends on
        </h4>
        {preds.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">{preds.map(chip)}</div>
        ) : (
          <p className="text-sm text-muted">No predecessors: can start immediately.</p>
        )}
        <h4 className="mt-3 mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
          Blocks
        </h4>
        {succs.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">{succs.map(chip)}</div>
        ) : (
          <p className="text-sm text-muted">Nothing depends on this task.</p>
        )}
      </section>

      {reqs.length > 0 ? (
        <section>
          <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
            Traces to
          </h4>
          <ul className="space-y-1.5">
            {reqs.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0 font-mono text-xs font-medium whitespace-nowrap text-muted">
                  {r.id}
                </span>
                <span className="text-brand-green-800">{r.text}</span>
                <PriorityBadge priority={r.priority} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {signals.length > 0 ? (
        <section>
          <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
            Risk signals
          </h4>
          <ul className="space-y-1.5">
            {signals.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-sm text-brand-green-800">
                <SeverityBadge severity={s.severity} />
                <span>{s.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
