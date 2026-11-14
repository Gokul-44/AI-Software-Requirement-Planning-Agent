import { useState } from 'react';
import {
  Badge,
  Card,
  EmptyState,
  IdChip,
  SectionTitle,
  SeverityBadge,
  Select,
} from '../../components/ui';
import { titleCase } from '../../lib/format';
import { usePlan } from './context';

const RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

const num = (n: number) => String(Number(n.toFixed(2)));

export function RisksTab() {
  const { plan, index, selectTask } = usePlan();
  const [severity, setSeverity] = useState('');
  const citedBy = new Map<string, string[]>();
  for (const r of plan.risks) {
    for (const sid of r.signal_ids) citedBy.set(sid, [...(citedBy.get(sid) ?? []), r.id]);
  }

  const risks = plan.risks
    .filter((r) => severity === '' || r.severity === severity)
    .sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9) || a.id.localeCompare(b.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted">
          Severity comes from computed signals, never from the language model. Every risk cites at
          least one signal with its measured value, so each claim can be checked against the
          schedule.
        </p>
        <Select label="Severity" value={severity} onChange={setSeverity} className="w-40">
          <option value="">All</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
      </div>

      {risks.length === 0 ? (
        <EmptyState title="No risks to show">
          {plan.risks.length === 0
            ? 'No risk signal crossed its threshold.'
            : 'No risk has this severity.'}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {risks.map((r) => {
            const signals = r.signal_ids
              .map((id) => index.signals.get(id))
              .filter((s) => s !== undefined);
            const taskIds = [...new Set(signals.flatMap((s) => s.task_ids))];
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-muted">{r.id}</span>
                  <SeverityBadge severity={r.severity} />
                  <Badge
                    className="bg-sand-100 text-muted ring-sand-300"
                    title="Who wrote the narrative"
                  >
                    {r.origin === 'llm' ? 'AI narrative' : 'template'}
                  </Badge>
                </div>
                <h3 className="mt-2 text-base font-semibold text-text">{r.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-brand-green-800">
                  {r.description}
                </p>

                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="text-xs font-semibold tracking-wide text-emerald-800 uppercase">
                    Mitigation
                  </div>
                  <p className="mt-0.5 text-sm text-text">{r.mitigation}</p>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div>
                    <div className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                      Evidence (cited signals)
                    </div>
                    <ul className="space-y-2">
                      {signals.map((s) => (
                        <li key={s.id} className="rounded-lg bg-sand-100 p-2.5 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-muted">
                              {s.id}
                            </span>
                            <span className="text-xs text-muted">{titleCase(s.kind)}</span>
                            <span className="ml-auto text-xs font-semibold text-text tabular-nums">
                              value {num(s.value)}
                              {s.threshold !== null ? ` · threshold ${num(s.threshold)}` : ''}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted">{s.message}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                      Linked tasks
                    </div>
                    {taskIds.length === 0 ? (
                      <p className="text-sm text-muted">
                        These signals describe the whole plan, not single tasks.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {taskIds.map((id) => (
                          <IdChip
                            key={id}
                            id={id}
                            critical={index.criticalIds.has(id)}
                            title={index.tasks.get(id)?.title}
                            onClick={() => selectTask(id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <section>
        <SectionTitle
          title="All computed signals"
          hint="Measured by code from the schedule. A signal that no risk cites is still a fact worth knowing."
        />
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-sand-100 text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">ID</th>
                  <th className="px-3 py-2.5 font-semibold">Kind</th>
                  <th className="px-3 py-2.5 font-semibold">Severity</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Value</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Threshold</th>
                  <th className="px-3 py-2.5 font-semibold">Message</th>
                  <th className="px-3 py-2.5 font-semibold">Cited by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-200">
                {plan.signals.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-mono text-xs font-medium text-muted">{s.id}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-brand-green-800">
                      {titleCase(s.kind)}
                    </td>
                    <td className="px-3 py-2">
                      <SeverityBadge severity={s.severity} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(s.value)}</td>
                    <td className="px-3 py-2 text-right text-muted tabular-nums">
                      {s.threshold === null ? '-' : num(s.threshold)}
                    </td>
                    <td className="px-3 py-2 text-muted">{s.message}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted">
                      {(citedBy.get(s.id) ?? []).join(', ') || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
