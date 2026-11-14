import { useState } from 'react';
import { Badge, Card, EmptyState, IdChip, Select, SeverityBadge } from '../../components/ui';
import { titleCase } from '../../lib/format';
import { usePlan } from './context';

const STAGE_NAMES = [
  '',
  'Requirements',
  'Stories',
  'Tasks',
  'Estimates',
  'Dependencies',
  'Scheduling',
  'Risks',
  'Assemble',
];
const RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };

export function IssuesTab() {
  const { plan, index, selectTask } = usePlan();
  const [severity, setSeverity] = useState('');
  const issues = plan.issues
    .filter((i) => severity === '' || i.severity === severity)
    .sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9) || a.id.localeCompare(b.id));

  if (plan.issues.length === 0) {
    return (
      <EmptyState title="No issues found" icon="✓">
        Every reference resolved, the graph is acyclic and every requirement is covered.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted">
          Defects the checks found in the AI output and how they were handled. Nothing is dropped
          silently.
        </p>
        <Select label="Severity" value={severity} onChange={setSeverity} className="w-40">
          <option value="">All ({plan.issues.length})</option>
          <option value="error">Errors</option>
          <option value="warning">Warnings</option>
          <option value="info">Info</option>
        </Select>
      </div>
      {issues.length === 0 ? (
        <EmptyState title="No issues with this severity" />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-sand-200">
            {issues.map((i) => (
              <li key={i.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-muted">{i.id}</span>
                  <SeverityBadge severity={i.severity} />
                  <Badge className="bg-sand-100 text-muted ring-sand-300">
                    {titleCase(i.kind)}
                  </Badge>
                  <span className="text-xs text-muted">
                    Stage {i.stage} · {STAGE_NAMES[i.stage] ?? ''}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-text">{i.message}</p>
                {i.resolution ? (
                  <p className="mt-1 text-sm text-muted">
                    <span className="font-medium text-muted">Resolution:</span> {i.resolution}
                  </p>
                ) : null}
                {i.refs.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {i.refs.map((ref) => (
                      <IdChip
                        key={ref}
                        id={ref}
                        {...(index.tasks.has(ref) ? { onClick: () => selectTask(ref) } : {})}
                        title={index.tasks.get(ref)?.title ?? 'Not found in the plan'}
                      />
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
