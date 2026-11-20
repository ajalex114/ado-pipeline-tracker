import type { AdoClient } from '@core/ado/ado-client';
import {
  mapPendingReviews,
  mapRunAttempt,
  mapRunResult,
  mapRunState,
  mapStages,
  resolveDisplayName,
} from '@core/ado/mappers';
import { buildResultsUrl, parseBuildRunUrl, runIdFromRef } from '@core/ado/url-parser';
import type { BuildFinishedListener } from '@core/attention/attention-service';
import type { Logger } from '@core/logging/logger';
import type { Metrics } from '@core/metrics/metrics';
import type { Notifier } from '@core/notifications/notifier';
import type { Repository } from '@core/storage/repository';
import {
  detectTransitions,
  transitionKey,
  type RunSnapshot,
} from '@core/tracking/transition-detector';
import { CONFIG } from '@shared/config';
import { canRerunFailedJobs, canRetryStage } from '@shared/run-actions';
import type { BuildRunRef, TrackedRun } from '@shared/types';
import type { TrackerEvent } from '@shared/types';
import { isTerminalResult } from '@shared/types';

export type TrackResult =
  { ok: true; run: TrackedRun; alreadyTracked: boolean } | { ok: false; message: string };

export type RunActionResult = { ok: true; run: TrackedRun } | { ok: false; message: string };

/**
 * How long a requested rerun may keep a run active while ADO still reports the
 * previous attempt's terminal status.
 */
const PENDING_RETRY_GRACE_MS = 3 * 60 * 1000;

/**
 * TrackerService owns the tracking lifecycle: onboarding runs, polling active
 * runs, detecting transitions, notifying, and auto-stopping terminal runs.
 *
 * It is deliberately UI- and chrome-agnostic: all IO is injected (Repository,
 * AdoClient, Notifier), keeping this class unit-testable and adherent to the
 * Single Responsibility and Dependency Inversion principles.
 */
export class TrackerService {
  constructor(
    private readonly repo: Repository,
    private readonly ado: AdoClient,
    private readonly notifier: Notifier,
    private readonly logger: Logger,
    private readonly metrics: Metrics,
    private readonly finishedListener?: BuildFinishedListener,
  ) {}

  /** Onboards a build run from a raw URL (paste, current tab, or shortcut). */
  async trackByUrl(rawUrl: string): Promise<TrackResult> {
    const parsed = parseBuildRunUrl(rawUrl);
    if (!parsed.ok) {
      this.metrics.increment('build_track_rejected_invalid_url', { reason: parsed.reason });
      this.logger.info('rejected build URL', { reason: parsed.reason });
      return { ok: false, message: parsed.message };
    }
    return this.trackByRef(parsed.ref);
  }

  async trackByRef(ref: BuildRunRef): Promise<TrackResult> {
    const id = runIdFromRef(ref);
    const existing = await this.repo.getTrackedRuns();
    const already = existing.find((r) => r.id === id);
    if (already) {
      this.metrics.increment('build_tracked_duplicate');
      // Re-activate if it had been auto-stopped and the user tracks it again.
      if (!already.isActive) {
        already.isActive = true;
        await this.repo.upsertTrackedRun(already);
      }
      return { ok: true, run: already, alreadyTracked: true };
    }

    const activeCount = existing.filter((r) => r.isActive).length;
    if (activeCount >= CONFIG.MAX_ACTIVE_RUNS) {
      this.metrics.increment('build_track_rejected_cap_reached');
      return {
        ok: false,
        message: `You can track at most ${CONFIG.MAX_ACTIVE_RUNS} active builds. Remove one and try again.`,
      };
    }

    const now = Date.now();
    const run: TrackedRun = {
      id,
      ref,
      displayName: `Build ${ref.buildId}`,
      runUrl: buildResultsUrl(ref),
      state: 'unknown',
      result: 'none',
      stages: [],
      isActive: true,
      addedAt: now,
      lastPolledAt: null,
    };

    // Best-effort initial fetch so the UI shows progress immediately.
    await this.refreshRun(run, { notify: false, recordEvents: false });
    await this.notifyInitialTerminalState(run);
    await this.repo.upsertTrackedRun(run);
    this.metrics.increment('build_tracked_added');
    this.logger.info('build tracked', { runId: id });
    try {
      await this.finishedListener?.onBuildTracked?.(run);
    } catch (error) {
      this.logger.warn('build-tracked listener failed', { error: safeErrorName(error) });
    }
    return { ok: true, run, alreadyTracked: false };
  }

  async untrack(runId: string): Promise<void> {
    await this.repo.removeTrackedRun(runId);
    this.metrics.increment('build_untracked');
    this.logger.info('build untracked', { runId });
  }

  /**
   * Manually refreshes a single tracked run (active or finished). A finished
   * run that is running again (e.g. rerun from ADO) is reactivated.
   */
  async refreshOne(runId: string): Promise<RunActionResult> {
    const run = await this.findRun(runId);
    if (!run) return this.runNotFound(runId);
    try {
      await this.refreshRun(run, { notify: true, recordEvents: true });
    } catch (error) {
      this.logger.error('manual refresh failed', { runId, error: safeErrorName(error) });
      return { ok: false, message: 'Could not refresh this build. Try again shortly.' };
    }
    await this.repo.upsertTrackedRun(run);
    this.metrics.increment('build_refreshed_manual', { active: run.isActive });
    this.logger.info('build refreshed manually', { runId, active: run.isActive });
    return run.errorMessage ? { ok: false, message: run.errorMessage } : { ok: true, run };
  }

  /** ADO "Rerun failed jobs" for the whole build. Resumes tracking the run. */
  async rerunFailedJobs(runId: string): Promise<RunActionResult> {
    const run = await this.findRun(runId);
    if (!run) return this.runNotFound(runId);
    if (!canRerunFailedJobs(run)) {
      this.metrics.increment('rerun_rejected_state', { scope: 'build' });
      return {
        ok: false,
        message: 'Only finished builds with failed or canceled jobs can be rerun.',
      };
    }
    this.metrics.increment('rerun_requested', { scope: 'build' });
    const result = await this.ado.retryBuild(run.ref);
    if (!result.ok) {
      this.metrics.increment('rerun_failed', { scope: 'build', kind: result.kind });
      this.logger.warn('rerun failed jobs rejected', {
        runId,
        kind: result.kind,
        status: result.status,
      });
      return { ok: false, message: result.message };
    }
    return this.resumeAfterRetry(run, 'build');
  }

  /** Retries the failed jobs of one stage. Resumes tracking the run. */
  async retryStage(runId: string, stageId: string): Promise<RunActionResult> {
    const run = await this.findRun(runId);
    if (!run) return this.runNotFound(runId);
    const stage = run.stages.find((s) => s.id === stageId);
    if (!stage || !stage.refName || !canRetryStage(run, stage)) {
      this.metrics.increment('rerun_rejected_state', { scope: 'stage' });
      return { ok: false, message: 'Only failed or canceled stages can be retried.' };
    }
    this.metrics.increment('rerun_requested', { scope: 'stage' });
    const result = await this.ado.retryStage(run.ref, stage.refName);
    if (!result.ok) {
      this.metrics.increment('rerun_failed', { scope: 'stage', kind: result.kind });
      this.logger.warn('stage retry rejected', { runId, kind: result.kind, status: result.status });
      return { ok: false, message: result.message };
    }
    return this.resumeAfterRetry(run, 'stage');
  }

  private async resumeAfterRetry(
    run: TrackedRun,
    scope: 'build' | 'stage',
  ): Promise<RunActionResult> {
    run.pendingRetry = { requestedAt: Date.now(), fromAttempt: run.attempt ?? 1 };
    run.isActive = true;
    run.state = 'notStarted';
    run.result = 'none';
    run.pendingReviews = [];
    delete run.errorMessage;
    await this.repo.upsertTrackedRun(run);
    this.metrics.increment('rerun_started', { scope });
    this.logger.info('rerun started; tracking resumed', { runId: run.id, scope });
    return { ok: true, run };
  }

  private async findRun(runId: string): Promise<TrackedRun | undefined> {
    const runs = await this.repo.getTrackedRuns();
    return runs.find((r) => r.id === runId);
  }

  private runNotFound(runId: string): RunActionResult {
    this.logger.warn('run action on untracked run', { runId });
    return { ok: false, message: 'This build is no longer tracked.' };
  }

  /** Polls every active run once. Safe to call from an alarm handler. */
  async pollAll(): Promise<void> {
    const active = await this.repo.getActiveRuns();
    this.logger.debug('poll cycle start', { activeCount: active.length });
    for (const run of active) {
      try {
        await this.refreshRun(run, { notify: true, recordEvents: true });
        await this.repo.upsertTrackedRun(run);
      } catch (error) {
        this.metrics.increment('poll_run_error');
        this.logger.error('poll run failed', { runId: run.id, error: safeErrorName(error) });
      }
    }
    await this.repo.pruneHistory();
    this.metrics.increment('poll_cycle_completed', { activeCount: active.length });
  }

  private async refreshRun(
    run: TrackedRun,
    opts: { notify: boolean; recordEvents: boolean },
  ): Promise<void> {
    const buildResult = await this.ado.getBuild(run.ref);
    if (!buildResult.ok) {
      run.errorMessage = buildResult.message;
      run.lastPolledAt = Date.now();
      return;
    }

    const timelineResult = await this.ado.getTimeline(run.ref);
    const stages = timelineResult.ok ? mapStages(timelineResult.data.records) : run.stages;
    const attempt = timelineResult.ok ? mapRunAttempt(timelineResult.data.records) : run.attempt;

    const snapshot: RunSnapshot = {
      state: mapRunState(buildResult.data.status),
      result: mapRunResult(buildResult.data.result),
      stages,
      attempt,
    };
    const snapshotTerminal = snapshot.state === 'completed' && isTerminalResult(snapshot.result);

    if (run.pendingRetry) {
      const retryObserved = !snapshotTerminal || (attempt ?? 1) > run.pendingRetry.fromAttempt;
      const graceExpired = Date.now() - run.pendingRetry.requestedAt > PENDING_RETRY_GRACE_MS;
      if (!retryObserved && !graceExpired) {
        // ADO has not picked up the rerun yet; keep waiting without diffing stale data.
        run.lastPolledAt = Date.now();
        return;
      }
      if (!retryObserved) {
        this.logger.warn('rerun not observed within grace period', { runId: run.id });
        this.metrics.increment('rerun_not_observed');
      }
      delete run.pendingRetry;
    }

    // Diff against the stored run BEFORE mutating it.
    const previousForDiff: TrackedRun = { ...run };
    const events = detectTransitions(previousForDiff, snapshot);

    run.displayName = resolveDisplayName(buildResult.data, run.displayName);
    const webUrl = buildResult.data._links?.web?.href;
    if (webUrl) run.runUrl = webUrl;
    run.state = snapshot.state;
    run.result = snapshot.result;
    run.stages = snapshot.stages;
    run.attempt = snapshot.attempt;
    run.lastPolledAt = Date.now();
    run.errorMessage = timelineResult.ok ? undefined : timelineResult.message;
    const previousReviews = run.pendingReviews ?? [];
    run.pendingReviews = snapshotTerminal
      ? []
      : timelineResult.ok
        ? mapPendingReviews(timelineResult.data.records)
        : previousReviews;
    const previousReviewIds = new Set(
      previousReviews.map((review) => `${review.id}:${review.kind}`),
    );
    for (const review of run.pendingReviews) {
      if (!previousReviewIds.has(`${review.id}:${review.kind}`)) {
        this.metrics.increment('build_human_wait_detected', { kind: review.kind });
        this.logger.info('build waiting for human action', { kind: review.kind });
      }
    }

    if (!run.isActive && !snapshotTerminal) {
      // e.g. failed jobs were rerun from Azure DevOps directly.
      run.isActive = true;
      this.metrics.increment('tracking_reactivated');
      this.logger.info('tracking reactivated; run is running again', { runId: run.id });
    }

    if (opts.recordEvents && opts.notify && events.length > 0) {
      const settings = await this.repo.getSettings();
      const history = await this.repo.getHistory();
      const alreadyNotified = new Set(history.filter((e) => e.notified).map((e) => e.eventId));
      const notified = this.notifier.notify(events, settings.notifications, alreadyNotified);
      const notifiedIds = new Set(notified.map((e) => e.eventId));
      const toStore = events.map((e) => ({ ...e, notified: notifiedIds.has(e.eventId) }));
      await this.repo.appendEvents(toStore);
    } else if (opts.recordEvents && events.length > 0) {
      await this.repo.appendEvents(events);
    }

    if (
      opts.recordEvents &&
      events.some((e) => e.type === 'pipelineCompleted' || e.type === 'pipelineFailed')
    ) {
      try {
        await this.finishedListener?.onBuildFinished(run);
      } catch (error) {
        this.logger.warn('build-finished listener failed', {
          runId: run.id,
          error: safeErrorName(error),
        });
      }
    }

    // Auto-stop when terminal (behavior §2). Tab lifecycle is irrelevant here.
    if (snapshotTerminal && run.isActive) {
      run.isActive = false;
      this.metrics.increment('tracking_auto_stopped', { result: snapshot.result });
      this.logger.info('tracking auto-stopped', { runId: run.id, result: snapshot.result });
    }
  }

  /**
   * If the first fetch already shows a terminal build, surface a single
   * completion/failure notification so users do not miss finished builds that
   * were added after the fact.
   */
  private async notifyInitialTerminalState(run: TrackedRun): Promise<void> {
    if (run.state !== 'completed' || !isTerminalResult(run.result)) {
      return;
    }

    const type =
      run.result === 'failed' || run.result === 'canceled' ? 'pipelineFailed' : 'pipelineCompleted';
    const event: TrackerEvent = {
      eventId: transitionKey(run.id, type, undefined, run.result, run.attempt),
      runId: run.id,
      runDisplayName: run.displayName,
      runUrl: run.runUrl,
      type,
      result: run.result,
      createdAt: Date.now(),
      notified: false,
    };

    const settings = await this.repo.getSettings();
    const history = await this.repo.getHistory();
    const alreadyNotified = new Set(history.filter((e) => e.notified).map((e) => e.eventId));
    const notified = this.notifier.notify([event], settings.notifications, alreadyNotified);
    const storedEvent = { ...event, notified: notified.length > 0 };
    await this.repo.appendEvents([storedEvent]);
  }
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
