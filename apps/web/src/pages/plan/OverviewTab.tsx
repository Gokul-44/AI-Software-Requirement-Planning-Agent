import { Link } from 'react-router-dom';
import { Badge, Card, IdChip, SectionTitle, Stat } from '../../components/ui';
import {
  CAPACITY_BOUND_RATIO,
  capacityRatio,
  formatCost,
  formatDays,
  formatDuration,
  formatNumber,
  pct,
  plural,
} from '../../lib/format';
import { usePlan } from './context';

export function OverviewTab() {
  const { plan, index, selectTask } = usePlan();
  const { schedule, coverage, run } = plan;
  const cfg = run.config;
  const cpmDays = schedule.cpm.duration_days;
  const planDays = schedule.capacity_plan.duration_days;
  const ratio = capacityRatio(planDays, cpmDays);
  const capacityBound = ratio !== null && ratio >= CAPACITY_BOUND_RATIO;
  const coverageRatio =
    coverage.requirements_total > 0
      ? coverage.requirements_with_task / coverage.requirements_total
      : 1;
  const errors = plan.issues.filter((i) => i.severity === 'error').length;
  const warnings = plan.issues.filter((i) => i.severity === 'warning').length;
  const infos = plan.issues.length - errors - warnings;
  const totalPoints = plan.tasks.reduce((n, t) => n + t.points, 0);
  const totalHours = plan.tasks.reduce((n, t) => n + t.hours, 0);
  const criticalCount = schedule.tasks.filter((t) => t.critical).length;

  const pointsByEpic = plan.epics.map((e) => {
    const points = plan.tasks
      .filter((t) => index.epicOfTask.get(t.id)?.id === e.id)
      .reduce((n, t) => n + t.points, 0);
    return { epic: e, points };
  });
  const maxEpicPoints = Math.max(1, ...pointsByEpic.map((p) => p.points));
  const layers = [...new Set(plan.tasks.map((t) => t.layer))]
    .map((layer) => ({
      layer,
      points: plan.tasks.filter((t) => t.layer === layer).reduce((n, t) => n + t.points, 0),
    }))
    .sort((a, b) => b.points - a.points);
  const maxLayerPoints = Math.max(1, ...layers.map((l) => l.points));

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <SectionTitle title="Summary" />
          <p className="text-sm leading-relaxed text-slate-700">{plan.summary}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
            <span>
              <strong className="text-slate-800">{plan.requirements.length}</strong> requirements
            </span>
            <span>
              <strong className="text-slate-800">{plan.epics.length}</strong> epics
            </span>
            <span>
              <strong className="text-slate-800">{plan.stories.length}</strong> stories
            </span>
            <span>
              <strong className="text-slate-800">{plan.tasks.length}</strong> tasks
            </span>
            <span>
              <strong className="text-slate-800">{totalPoints}</strong> points · {totalHours} h
            </span>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <SectionTitle
            title="Assumptions"
            hint="The agent filled these gaps in your idea. Check them."
          />
          {plan.assumptions.length === 0 ? (
            <p className="text-sm text-slate-400">No assumptions were recorded.</p>
          ) : (
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700 marker:text-slate-300">
              {plan.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="border-brand-200 bg-brand-50/40">
        <SectionTitle
          title="Two timelines, two questions"
          hint="CPM is a lower bound with unlimited people. The sprint plan is what your team of this size can actually deliver."
        />
        <p className="text-sm text-slate-800">
          <strong>Dependency-limited minimum (CPM): {formatDays(cpmDays)} working days</strong>
          <span className="mx-2 text-slate-400">·</span>
          <strong>
            Capacity-feasible plan ({plural(cfg.team_size, 'dev')}):{' '}
            {plural(schedule.capacity_plan.sprint_count, 'sprint')} ≈ {formatDays(planDays)} working
            days
          </strong>
          {ratio !== null ? (
            <>
              <span className="mx-2 text-slate-400">·</span>
              <strong>Ratio {ratio.toFixed(1)}×</strong>
              <span className={capacityBound ? ' font-semibold text-amber-700' : ' text-slate-600'}>
                {capacityBound
                  ? ' → capacity-bound: adding people would shorten the plan.'
                  : ' → mostly dependency-limited: adding people would help little.'}
              </span>
            </>
          ) : null}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          See both on the{' '}
          <Link className="font-medium text-brand-600 underline" to="../timeline">
            Timeline tab
          </Link>
          , and try other team sizes with the what-if panel.
        </p>
      </Card>

      <section>
        <SectionTitle title="Key numbers" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <Stat
            label="CPM minimum"
            value={formatDays(cpmDays)}
            unit="days"
            note={`${schedule.cpm.duration_hours} h with unlimited people`}
            tone="brand"
            title="Critical path length: the shortest possible duration if everybody could work in parallel."
          />
          <Stat
            label="Capacity plan"
            value={schedule.capacity_plan.sprint_count}
            unit={schedule.capacity_plan.sprint_count === 1 ? 'sprint' : 'sprints'}
            note={`${schedule.capacity_plan.capacity_points_per_sprint} points per sprint · ${cfg.team_size} devs`}
            tone="brand"
          />
          <Stat
            label="Capacity plan duration"
            value={formatDays(planDays)}
            unit="days"
            note={`${cfg.sprint_length_days}-day sprints, ${cfg.pack_mode} packing`}
          />
          <Stat
            label="Capacity-bound ratio"
            value={ratio === null ? 'n/a' : `${ratio.toFixed(2)}×`}
            note={
              capacityBound ? 'capacity-bound (≥ 1.5×)' : 'below the 1.5× capacity-bound threshold'
            }
            tone={capacityBound ? 'warn' : 'default'}
            title="Capacity-feasible duration divided by the CPM duration."
          />
          <Stat
            label="Requirement coverage"
            value={pct(coverageRatio)}
            note={`${coverage.requirements_with_task} of ${coverage.requirements_total} requirements reach a task`}
            tone={coverageRatio === 1 ? 'good' : 'warn'}
          />
          <Stat
            label="Tasks"
            value={plan.tasks.length}
            note={`${criticalCount} on the critical path`}
          />
          <Stat
            label="Dependencies"
            value={plan.dependencies.length}
            note="finish-to-start edges"
          />
          <Stat
            label="Issues"
            value={plan.issues.length}
            note={`${errors} errors · ${warnings} warnings${infos > 0 ? ` · ${infos} info` : ''}`}
            tone={errors > 0 ? 'bad' : warnings > 0 ? 'warn' : 'good'}
          />
        </div>
      </section>

      {coverage.uncovered_requirement_ids.length > 0 ||
      coverage.stories_without_tasks.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <div className="text-sm font-semibold text-amber-900">Coverage gaps</div>
          {coverage.uncovered_requirement_ids.length > 0 ? (
            <p className="mt-1 text-sm text-amber-900">
              Requirements with no story:{' '}
              {coverage.uncovered_requirement_ids.map((id) => (
                <Badge key={id} className="mr-1 bg-white text-amber-900 ring-amber-300">
                  {id}
                </Badge>
              ))}
              <Link to="../requirements" className="ml-1 underline">
                see traceability
              </Link>
            </p>
          ) : null}
          {coverage.stories_without_tasks.length > 0 ? (
            <p className="mt-1 text-sm text-amber-900">
              Stories with no task: {coverage.stories_without_tasks.join(', ')}
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Effort by epic" hint="Story points" />
          <ul className="space-y-3">
            {pointsByEpic.map(({ epic, points }) => (
              <li key={epic.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-slate-700">
                    <span
                      className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: index.colorOfEpic(epic.id) }}
                    />
                    {epic.title}
                  </span>
                  <span className="font-medium text-slate-900 tabular-nums">{points}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${(points / maxEpicPoints) * 100}%`,
                      background: index.colorOfEpic(epic.id),
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <SectionTitle title="Effort by layer" hint="Story points" />
          <ul className="space-y-3">
            {layers.map(({ layer, points }) => (
              <li key={layer}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-slate-700 capitalize">{layer}</span>
                  <span className="font-medium text-slate-900 tabular-nums">{points}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-slate-500"
                    style={{ width: `${(points / maxLayerPoints) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {schedule.cpm.critical_path.length > 0 ? (
        <Card>
          <SectionTitle
            title="Critical path"
            hint="One longest chain of zero-slack tasks (CPM). A delay in any of them delays the earliest finish."
          />
          <ol className="flex flex-wrap items-center gap-1.5">
            {schedule.cpm.critical_path.map((id, i) => (
              <li key={id} className="flex items-center gap-1.5">
                <IdChip
                  id={id}
                  critical
                  title={index.tasks.get(id)?.title}
                  onClick={() => selectTask(id)}
                />
                {i < schedule.cpm.critical_path.length - 1 ? (
                  <span className="text-slate-300">→</span>
                ) : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <Card>
        <SectionTitle title="Run details" />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
          <Detail label="Provider · model" value={`${run.llm.provider} · ${run.llm.model}`} />
          <Detail
            label="Tokens in / out"
            value={`${formatNumber(run.usage.input_tokens)} / ${formatNumber(run.usage.output_tokens)}`}
          />
          <Detail label="Estimated cost" value={formatCost(run.usage.est_cost_usd)} />
          <Detail label="Duration" value={formatDuration(run.usage.duration_ms)} />
          <Detail
            label="Team"
            value={`${cfg.team_size} devs × ${cfg.velocity_points_per_person} pts`}
          />
          <Detail
            label="Sprint"
            value={`${cfg.sprint_length_days} days × ${cfg.focus_hours_per_day} focus h`}
          />
          <Detail label="Packing" value={cfg.pack_mode} />
          <Detail
            label="Prompt versions"
            value={Object.entries(run.llm.prompt_versions)
              .map(([k, v]) => `${k}:${v}`)
              .join(' ')}
          />
        </dl>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}
