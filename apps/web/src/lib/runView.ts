import type { RunStatus } from '../api/types';

/** What the run page shows for a run status. Pure, so the rules are unit-tested. */
export interface RunView {
  heading: string;
  /** The elapsed clock only makes sense while the run is going (or just finished). */
  showClock: boolean;
  /** "This page refreshes every 2 seconds": only while the page really polls. */
  showRefreshNote: boolean;
  /** The "your plan will appear here" preview is hidden for a run that has stopped. */
  showPlanPreview: boolean;
  failed: boolean;
}

export function runView(status: RunStatus['status']): RunView {
  const failed = status === 'failed';
  return {
    heading:
      status === 'succeeded'
        ? 'Your plan is ready'
        : failed
          ? 'The run stopped'
          : 'Building your plan',
    showClock: !failed,
    showRefreshNote: status === 'queued' || status === 'running',
    showPlanPreview: !failed,
    failed,
  };
}

/**
 * The "attempts" column of the stage list. Stage 3 makes one model call per epic, each right the
 * first time, so "6 attempts" would read like five failures: it is labelled "model calls".
 */
export function attemptLabel(stage: number, attempts: number): string {
  const unit = stage === 3 ? 'model call' : 'attempt';
  return `${attempts} ${unit}${attempts === 1 ? '' : 's'}`;
}
