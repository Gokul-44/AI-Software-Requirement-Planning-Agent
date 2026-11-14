import { AlertCircle, RotateCcw } from 'lucide-react';
import type { RunStatus } from '../api/types';
import { friendlyStageError, isQuotaFailure } from '../lib/friendlyError';
import { Button, GoldenDemoButton } from './ui';

/**
 * The box shown at the top of the run page when a stage failed. A used-up quota offers a sample
 * plan and "Retry from stage N" (nothing finished is paid for again); other failures offer the
 * retry first, then a new run.
 */
export function RunErrorPanel({
  error,
  onRetry,
  retrying = false,
  onNewRun,
}: {
  error: NonNullable<RunStatus['error']>;
  onRetry: () => void;
  retrying?: boolean;
  onNewRun: () => void;
}) {
  const friendly = friendlyStageError(error);
  const quota = isQuotaFailure(error);
  const retry = (
    <Button
      key="retry"
      size="sm"
      variant={quota ? 'secondary' : 'primary'}
      disabled={retrying}
      onClick={onRetry}
    >
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      {retrying ? 'Retrying…' : `Retry from stage ${error.stage}`}
    </Button>
  );
  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-semibold text-red-900">
            {quota ? friendly.title : `Stage ${error.stage} failed: ${friendly.title}`}
          </div>
          <p className="mt-1 text-sm text-red-900">{friendly.message}</p>
          {error.message ? (
            <details className="mt-2 text-xs text-red-900">
              <summary className="cursor-pointer font-medium">Technical detail</summary>
              <p className="mt-1 break-words">{error.message}</p>
            </details>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {quota ? (
              <>
                <GoldenDemoButton size="sm" label="Open a sample plan" />
                {retry}
              </>
            ) : (
              <>
                {retry}
                <Button size="sm" onClick={onNewRun}>
                  Start a new run
                </Button>
                <GoldenDemoButton size="sm" variant="secondary" />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
