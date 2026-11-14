import { useState } from 'react';
import { EmptyState, IdChip, PriorityBadge, Select } from '../../components/ui';
import { usePlan } from './context';

export function StoriesTab() {
  const { plan, index, selectTask } = usePlan();
  const [epic, setEpic] = useState('');
  const [priority, setPriority] = useState('');

  const epics = plan.epics.filter((e) => epic === '' || e.id === epic);
  const visible = (id: string) => {
    const s = index.stories.get(id);
    return s !== undefined && (priority === '' || s.priority === priority);
  };
  const total = plan.stories.filter(
    (s) => (epic === '' || s.epic_id === epic) && (priority === '' || s.priority === priority),
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Epic" value={epic} onChange={setEpic} className="w-64">
          <option value="">All epics</option>
          {plan.epics.map((e) => (
            <option key={e.id} value={e.id}>
              {e.id} {e.title}
            </option>
          ))}
        </Select>
        <Select label="Priority" value={priority} onChange={setPriority} className="w-40">
          <option value="">All</option>
          <option value="must">Must</option>
          <option value="should">Should</option>
          <option value="could">Could</option>
        </Select>
        <span className="pb-2 text-sm text-muted">
          {total} of {plan.stories.length} stories
        </span>
      </div>

      {total === 0 ? (
        <EmptyState title="No stories match these filters" />
      ) : (
        epics.map((e) => {
          const stories = e.story_ids.filter(visible);
          if (stories.length === 0) return null;
          const color = index.colorOfEpic(e.id);
          return (
            <section key={e.id} aria-labelledby={`epic-${e.id}`}>
              <div className="mb-3 flex items-start gap-3">
                <span
                  className="mt-1.5 h-3 w-3 shrink-0 rounded-sm"
                  style={{ background: color }}
                />
                <div>
                  <h2 id={`epic-${e.id}`} className="text-base font-semibold text-text">
                    <span className="mr-2 font-mono text-xs text-muted">{e.id}</span>
                    {e.title}
                  </h2>
                  <p className="text-sm text-muted">{e.description}</p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {stories.map((sid) => {
                  const s = index.stories.get(sid);
                  if (!s) return null;
                  const points = s.task_ids.reduce(
                    (n, tid) => n + (index.tasks.get(tid)?.points ?? 0),
                    0,
                  );
                  return (
                    <div
                      key={s.id}
                      className="flex flex-col gap-3 rounded-xl border border-l-4 border-border bg-surface p-5 shadow-sm"
                      style={{ borderLeftColor: color }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-muted">{s.id}</span>
                        <PriorityBadge priority={s.priority} />
                        <span className="ml-auto text-xs text-muted">
                          {s.task_ids.length} tasks · {points} pts
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-text">
                        As a <strong>{s.as_a}</strong>, I want {s.i_want}, so that {s.so_that}.
                      </p>
                      <div>
                        <div className="text-xs font-semibold tracking-wide text-muted uppercase">
                          Acceptance criteria
                        </div>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-brand-green-800 marker:text-sand-600">
                          {s.acceptance_criteria.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sand-200 pt-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted">Requirements</span>
                          {s.requirement_ids.map((r) => (
                            <span
                              key={r}
                              className="rounded bg-sand-200 px-1.5 py-0.5 font-mono text-xs text-brand-green-800"
                              title={index.requirements.get(r)?.text}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted">Tasks</span>
                          {s.task_ids.map((t) => (
                            <IdChip
                              key={t}
                              id={t}
                              critical={index.criticalIds.has(t)}
                              title={index.tasks.get(t)?.title}
                              onClick={() => selectTask(t)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
