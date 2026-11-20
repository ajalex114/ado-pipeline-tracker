import { useEffect, useRef, useState } from 'react';
import { canRerunFailedJobs, canRetryStage } from '@shared/run-actions';
import type { TrackedRun } from '@shared/types';
import {
  formatRelativeTime,
  pendingReviewBadge,
  runStatusBadge,
  stageStatusBadge,
} from '@shared/view-model';
import { StatusChip } from './StatusChip';

/** Resolves to an error message, or null on success. */
export type RunAction = () => Promise<string | null>;

interface Props {
  run: TrackedRun;
  onRemove: (runId: string) => void;
  onRefresh: (runId: string) => Promise<string | null>;
  onRerunFailedJobs: (runId: string) => Promise<string | null>;
  onRetryStage: (runId: string, stageId: string) => Promise<string | null>;
  highlighted?: boolean;
}

/** Card rendering a single tracked build with its stage-level progress. */
export function TrackedRunCard({
  run,
  onRemove,
  onRefresh,
  onRerunFailedJobs,
  onRetryStage,
  highlighted = false,
}: Props): JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = async (action: RunAction) => {
    setBusy(true);
    setActionError(null);
    try {
      setActionError(await action());
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (highlighted) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlighted]);

  const pendingReviews =
    run.state === 'completed' || run.pendingRetry ? [] : (run.pendingReviews ?? []);
  const waitingBadge = pendingReviewBadge(pendingReviews);
  const badge = waitingBadge ?? runStatusBadge(run.state, run.result);
  return (
    <div
      ref={cardRef}
      className={`card${waitingBadge ? ' card--waiting' : ''}${highlighted ? ' card--highlight' : ''}`}
      aria-live={highlighted ? 'polite' : undefined}
    >
      <div className="card-header">
        <div style={{ minWidth: 0 }}>
          <div className="card-title" title={run.displayName}>
            {run.displayName}
          </div>
          <div className="card-sub">
            {run.ref.project}
            {run.lastPolledAt
              ? ` · updated ${formatRelativeTime(run.lastPolledAt)}`
              : ' · not polled yet'}
          </div>
        </div>
        <div className="card-actions">
          <StatusChip badge={badge} />
          <button
            className="text-button refresh-button"
            aria-label={`Refresh ${run.displayName}`}
            title="Refresh this build"
            disabled={busy}
            onClick={() => void runAction(() => onRefresh(run.id))}
          >
            ⟳
          </button>
          <button
            className="remove-button"
            aria-label={`Stop tracking ${run.displayName}`}
            title="Stop tracking"
            onClick={() => onRemove(run.id)}
          >
            ✕
          </button>
        </div>
      </div>

      {waitingBadge && (
        <div className="review-callout">
          <p className="waiting-text" role="status">
            {waitingBadge.label}. Review and respond in Azure DevOps.
          </p>
          <a
            className="button-primary review-action"
            href={run.runUrl}
            target="_blank"
            rel="noreferrer"
            title="Open the build in a new tab to review and approve or reject in Azure DevOps"
          >
            Review in Azure DevOps
          </a>
        </div>
      )}
      {run.errorMessage && <p className="error-text">{run.errorMessage}</p>}
      {run.stages.length > 0 ? (
        <div className="stages">
          {run.stages.map((stage) => (
            <div className="stage-row" key={stage.id}>
              <span className="stage-name" title={stage.name}>
                {stage.name}
              </span>
              <div className="card-actions">
                {canRetryStage(run, stage) && (
                  <button
                    className="text-button"
                    aria-label={`Retry failed jobs in stage ${stage.name}`}
                    title="Rerun the failed jobs in this stage"
                    disabled={busy}
                    onClick={() => void runAction(() => onRetryStage(run.id, stage.id))}
                  >
                    Retry
                  </button>
                )}
                <StatusChip
                  badge={
                    pendingReviewBadge(
                      pendingReviews.filter((review) => review.stageId === stage.id),
                    ) ?? stageStatusBadge(stage.state, stage.result)
                  }
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint-text">No stages reported for this build.</p>
      )}

      {actionError && <p className="error-text">{actionError}</p>}
      {run.pendingRetry && <p className="hint-text">Rerun requested — waiting for Azure DevOps…</p>}

      <div className="card-actions" style={{ justifyContent: 'space-between' }}>
        <a className="link" href={run.runUrl} target="_blank" rel="noreferrer">
          Open in Azure DevOps ↗
        </a>
        {canRerunFailedJobs(run) ? (
          <button
            className="icon-button"
            title="Rerun the failed jobs of this build in Azure DevOps"
            disabled={busy}
            onClick={() => void runAction(() => onRerunFailedJobs(run.id))}
          >
            Rerun failed jobs
          </button>
        ) : (
          !run.isActive && <span className="hint-text">Tracking stopped (finished)</span>
        )}
      </div>
    </div>
  );
}
