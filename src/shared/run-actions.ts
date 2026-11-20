import type { RunResult, StageInfo, TrackedRun } from './types';

/** Results for which Azure DevOps offers "Rerun failed jobs" / "Retry stage". */
const RERUNNABLE_RESULTS: ReadonlySet<RunResult> = new Set<RunResult>([
  'failed',
  'partiallySucceeded',
  'canceled',
]);

export function canRerunFailedJobs(run: TrackedRun): boolean {
  return run.state === 'completed' && RERUNNABLE_RESULTS.has(run.result) && !run.pendingRetry;
}

export function canRetryStage(run: TrackedRun, stage: StageInfo): boolean {
  return (
    !run.pendingRetry &&
    Boolean(stage.refName) &&
    stage.state === 'completed' &&
    RERUNNABLE_RESULTS.has(stage.result)
  );
}
