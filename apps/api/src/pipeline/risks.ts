import type { PlanRisk, RisksOutput, Severity3, Signal } from '@spm/shared';
import type { IssueDraft } from '../db/repository.js';
import type { Stage7Input } from './inputs.js';
import { clip } from './support.js';

/** The model sees at most this many signals (the most severe first) and may cite only those. */
export const MAX_SIGNALS_SENT = 30;
export const MAX_RISKS = 10;
const MAX_TEMPLATE_RISKS = 8;

const RANK: Record<Severity3, number> = { low: 0, medium: 1, high: 2 };
const bySeverityThenId = (a: Signal, b: Signal) =>
  RANK[b.severity] - RANK[a.severity] || a.id.localeCompare(b.id);

export function signalsForPrompt(signals: readonly Signal[]): Signal[] {
  return [...signals].sort(bySeverityThenId).slice(0, MAX_SIGNALS_SENT);
}

export function riskInput(
  summary: string,
  sent: readonly Signal[],
  titleOf: ReadonlyMap<string, string>,
): Stage7Input {
  const named = new Set(sent.flatMap((s) => s.task_ids));
  return {
    summary,
    signals: sent.map((s) => ({
      id: s.id,
      kind: s.kind,
      severity: s.severity,
      message: s.message,
      value: s.value,
      task_ids: s.task_ids,
    })),
    task_titles: Object.fromEntries(
      [...named].sort().flatMap((id) => {
        const title = titleOf.get(id);
        return title === undefined ? [] : [[id, title] as const];
      }),
    ),
  };
}

export interface RiskDraft {
  title: string;
  description: string;
  mitigation: string;
  signal_ids: string[];
  origin: 'llm' | 'template';
}

/**
 * B5: a risk must cite at least one signal id, and every id must be in the signal set the model
 * was given. Anything else is rejected (and recorded), never repaired by guessing.
 */
export function filterRisks(
  out: RisksOutput,
  allowed: ReadonlySet<string>,
): { kept: RiskDraft[]; issues: IssueDraft[] } {
  const kept: RiskDraft[] = [];
  const issues: IssueDraft[] = [];
  for (const risk of out.risks) {
    const ids = [...new Set(risk.signal_ids)];
    const unknown = ids.filter((id) => !allowed.has(id));
    const reason =
      ids.length === 0
        ? 'it cites no signal'
        : unknown.length > 0
          ? `it cites ${unknown.length === 1 ? 'a signal' : 'signals'} that do not exist (${unknown.join(', ')})`
          : null;
    if (reason !== null) {
      issues.push({
        stage: 7,
        severity: 'warning',
        kind: 'risk_rejected',
        message: `Risk "${clip(risk.title, 80)}" was rejected: ${reason}.`,
        refs: unknown,
        resolution: 'Dropped. Every risk must be grounded in a computed signal.',
      });
      continue;
    }
    kept.push({
      title: risk.title,
      description: risk.description,
      mitigation: risk.mitigation,
      signal_ids: ids,
      origin: 'llm',
    });
    if (kept.length === MAX_RISKS) break;
  }
  return { kept, issues };
}

const label = (kind: string) => kind.replace(/_/g, ' ');

/**
 * Fallback when no model risk survives: one template risk per high-severity signal, or, when
 * there is none, per medium (then low) signal. The register is never empty and always grounded.
 */
export function templateRisks(signals: readonly Signal[]): RiskDraft[] {
  const sorted = [...signals].sort(bySeverityThenId);
  const top = sorted[0]?.severity;
  const chosen = top === undefined ? [] : sorted.filter((s) => s.severity === top);
  return chosen.slice(0, MAX_TEMPLATE_RISKS).map((s) => ({
    title: clip(
      `${s.severity === 'high' ? 'High' : s.severity === 'medium' ? 'Medium' : 'Low'}-severity signal: ${label(s.kind)}`,
      100,
    ),
    description: clip(s.message, 500),
    mitigation:
      'Review this signal with the team, assign an owner and decide whether the plan can be changed to reduce it.',
    signal_ids: [s.id],
    origin: 'template' as const,
  }));
}

/** B5 / N6: the severity is the highest severity among the signals the risk cites. */
export function toPlanRisks(drafts: readonly RiskDraft[], signals: readonly Signal[]): PlanRisk[] {
  const byId = new Map(signals.map((s) => [s.id, s]));
  return drafts.map((d, i) => {
    const severity = d.signal_ids.reduce<Severity3>((top, id) => {
      const s = byId.get(id);
      return s !== undefined && RANK[s.severity] > RANK[top] ? s.severity : top;
    }, 'low');
    return {
      id: `RK-${String(i + 1).padStart(3, '0')}`,
      severity,
      title: d.title,
      description: d.description,
      mitigation: d.mitigation,
      signal_ids: d.signal_ids,
      origin: d.origin,
    };
  });
}
