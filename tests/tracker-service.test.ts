import { describe, it, expect, vi } from 'vitest';
import { TrackerService } from '../src/core/tracking/tracker-service';
import { Repository, type KeyValueStore } from '../src/core/storage/repository';
import { Notifier, type NotificationPort } from '../src/core/notifications/notifier';
import { InMemoryMetrics } from '../src/core/metrics/metrics';
import { createLogger } from '../src/core/logging/logger';
import type { AdoClient } from '../src/core/ado/ado-client';
import type { AdoBuildResponse, AdoTimelineResponse } from '../src/core/ado/ado-types';
import { CONFIG } from '../src/shared/config';

class MemoryStore implements KeyValueStore {
  data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }
}

/** Scriptable fake ADO client so tests can drive build progression. */
class FakeAdo {
  build: AdoBuildResponse = { id: 1, status: 'inProgress', result: 'none' };
  timeline: AdoTimelineResponse = { records: [] };
  buildFails: 'auth' | null = null;
  timelineFails = false;
  retryFails = false;
  retryBuildCalls = 0;
  retryStageCalls: string[] = [];

  async getBuild() {
    if (this.buildFails) {
      return { ok: false as const, kind: this.buildFails, message: 'no access' };
    }
    return { ok: true as const, data: this.build };
  }
  async getTimeline() {
    if (this.timelineFails) {
      return { ok: false as const, kind: 'network' as const, message: 'timeline unavailable' };
    }
    return { ok: true as const, data: this.timeline };
  }
  async retryBuild() {
    this.retryBuildCalls++;
    if (this.retryFails) return { ok: false as const, kind: 'auth' as const, message: 'denied' };
    return { ok: true as const, data: this.build };
  }
  async retryStage(_ref: unknown, stageRefName: string) {
    this.retryStageCalls.push(stageRefName);
    if (this.retryFails) return { ok: false as const, kind: 'auth' as const, message: 'denied' };
    return { ok: true as const, data: undefined };
  }
}

const RUN_ID = 'org/proj/1';
const failedStage = {
  id: 's1',
  type: 'Stage',
  name: 'Test',
  identifier: 'test',
  state: 'completed',
  result: 'failed',
  order: 1,
  attempt: 1,
};
const failedJob = {
  id: 'j1',
  parentId: 's1',
  type: 'Job',
  name: 'Job',
  state: 'completed',
  result: 'failed',
  attempt: 1,
};

/** Tracks a build that has already failed (one notification shown). */
async function trackFailedBuild(ctx: ReturnType<typeof makeService>) {
  ctx.ado.build = { id: 1, status: 'completed', result: 'failed', definition: { name: 'CI' } };
  ctx.ado.timeline = { records: [failedStage, failedJob] };
  await ctx.service.trackByUrl(URL);
}

function makeService() {
  const store = new MemoryStore();
  const repo = new Repository(store);
  const logger = createLogger('test', 'error');
  const metrics = new InMemoryMetrics(logger);
  const shown: string[] = [];
  const port: NotificationPort = { show: (id) => shown.push(id) };
  const notifier = new Notifier(port, logger, metrics);
  const ado = new FakeAdo();
  const finished: string[] = [];
  const listener = {
    onBuildFinished: async (run: { id: string; result: string }) =>
      void finished.push(`${run.id}:${run.result}`),
    onBuildTracked: vi.fn(async () => {
      expect(await repo.getTrackedRuns()).toHaveLength(1);
    }),
  };
  const service = new TrackerService(
    repo,
    ado as unknown as AdoClient,
    notifier,
    logger,
    metrics,
    listener,
  );
  return { service, repo, ado, shown, metrics, finished, listener };
}

const URL = 'https://dev.azure.com/org/proj/_build/results?buildId=1';

describe('TrackerService.trackByUrl', () => {
  it('requests a popup only for a newly saved build, not duplicates or invalid input', async () => {
    const { service, listener } = makeService();
    await service.trackByUrl('invalid');
    expect(listener.onBuildTracked).not.toHaveBeenCalled();
    await service.trackByUrl(URL);
    await service.trackByUrl(URL);
    expect(listener.onBuildTracked).toHaveBeenCalledOnce();
  });

  it('keeps tracking saved if the confirmation listener fails', async () => {
    const { service, repo, listener } = makeService();
    listener.onBuildTracked.mockRejectedValueOnce(new Error('popup unavailable'));
    expect((await service.trackByUrl(URL)).ok).toBe(true);
    expect(await repo.getActiveRuns()).toHaveLength(1);
  });

  it('rejects a pipeline definition link', async () => {
    const { service } = makeService();
    const result = await service.trackByUrl('https://dev.azure.com/org/proj/_build?definitionId=9');
    expect(result.ok).toBe(false);
  });

  describe('TrackerService human waits', () => {
    const records = [
      { id: 's1', type: 'Stage', state: 'pending', attempt: 2 },
      { id: 'c1', type: 'Checkpoint', parentId: 's1', state: 'inProgress', attempt: 1 },
      { id: 'a1', type: 'Checkpoint.Approval', parentId: 'c1', state: 'inProgress', attempt: 1 },
    ];

    it('persists waits, deduplicates detection metrics, and clears resolved approvals', async () => {
      const { service, ado, repo, metrics } = makeService();
      ado.timeline = { records };
      await service.trackByUrl(URL);
      await service.pollAll();
      expect((await repo.getTrackedRuns())[0].pendingReviews).toEqual([
        { id: 'a1', kind: 'approval', stageId: 's1' },
      ]);
      expect(metrics.snapshot()['build_human_wait_detected']).toBe(1);
      ado.timeline = { records: records.map((r) => ({ ...r, state: 'completed' })) };
      await service.refreshOne(RUN_ID);
      expect((await repo.getTrackedRuns())[0].pendingReviews).toEqual([]);
    });

    it('retains the last wait and surfaces timeline failures, then recovers', async () => {
      const { service, ado, repo } = makeService();
      ado.timeline = { records };
      await service.trackByUrl(URL);
      ado.timelineFails = true;
      expect((await service.refreshOne(RUN_ID)).ok).toBe(false);
      let tracked = (await repo.getTrackedRuns())[0];
      expect(tracked.pendingReviews).toHaveLength(1);
      expect(tracked.errorMessage).toBe('timeline unavailable');
      expect(tracked.isActive).toBe(true);
      ado.timelineFails = false;
      ado.timeline = { records: [] };
      expect((await service.refreshOne(RUN_ID)).ok).toBe(true);
      tracked = (await repo.getTrackedRuns())[0];
      expect(tracked.pendingReviews).toEqual([]);
      expect(tracked.errorMessage).toBeUndefined();
    });

    it('clears stale waits on terminal status even when the timeline is unavailable', async () => {
      const { service, ado, repo } = makeService();
      ado.timeline = { records };
      await service.trackByUrl(URL);
      ado.timelineFails = true;
      ado.build = { id: 1, status: 'completed', result: 'failed' };
      await service.pollAll();
      const tracked = (await repo.getTrackedRuns())[0];
      expect(tracked.pendingReviews).toEqual([]);
      expect(tracked.isActive).toBe(false);
    });
  });

  it('tracks a valid build and stores it active', async () => {
    const { service, repo } = makeService();
    const result = await service.trackByUrl(URL);
    expect(result.ok).toBe(true);
    const runs = await repo.getTrackedRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].isActive).toBe(true);
  });

  it('notifies when the build is already terminal at track time', async () => {
    const { service, ado, shown, repo } = makeService();
    ado.build = { id: 1, status: 'completed', result: 'succeeded', definition: { name: 'CI' } };
    await service.trackByUrl(URL);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain('pipelineCompleted');
    const history = await repo.getHistory();
    expect(history.some((e) => e.type === 'pipelineCompleted' && e.notified)).toBe(true);
  });

  it('is idempotent for an already-tracked build', async () => {
    const { service, repo } = makeService();
    await service.trackByUrl(URL);
    const second = await service.trackByUrl(URL);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.alreadyTracked).toBe(true);
    expect(await repo.getTrackedRuns()).toHaveLength(1);
  });

  it('enforces the active-run cap', async () => {
    const { service, repo } = makeService();
    const runs = Array.from({ length: CONFIG.MAX_ACTIVE_RUNS }, (_, i) => ({
      id: `org/proj/${i + 100}`,
      ref: { collectionBaseUrl: 'x', organization: 'org', project: 'proj', buildId: i + 100 },
      displayName: 'x',
      runUrl: 'x',
      state: 'inProgress' as const,
      result: 'none' as const,
      stages: [],
      isActive: true,
      addedAt: 1,
      lastPolledAt: null,
    }));
    await repo.saveTrackedRuns(runs);
    const result = await service.trackByUrl(URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('at most');
  });
});

describe('TrackerService.refreshOne', () => {
  it('updates a single run and reports unknown runs', async () => {
    const { service, ado, repo } = makeService();
    await service.trackByUrl(URL);
    ado.timeline = {
      records: [{ id: 's1', type: 'Stage', name: 'Build', state: 'inProgress', order: 1 }],
    };
    const result = await service.refreshOne(RUN_ID);
    expect(result.ok).toBe(true);
    expect((await repo.getTrackedRuns())[0].stages).toHaveLength(1);
    expect((await service.refreshOne('org/proj/999')).ok).toBe(false);
  });

  it('reactivates a finished run that is running again', async () => {
    const ctx = makeService();
    await trackFailedBuild(ctx);
    expect((await ctx.repo.getTrackedRuns())[0].isActive).toBe(false);
    ctx.ado.build = { id: 1, status: 'inProgress', result: 'none' };
    await ctx.service.refreshOne(RUN_ID);
    expect((await ctx.repo.getTrackedRuns())[0].isActive).toBe(true);
  });

  it('returns the fetch error message', async () => {
    const { service, ado } = makeService();
    await service.trackByUrl(URL);
    ado.buildFails = 'auth';
    const result = await service.refreshOne(RUN_ID);
    expect(result.ok).toBe(false);
  });
});

describe('TrackerService reruns', () => {
  it('reruns failed jobs, resumes tracking, and notifies again for the new attempt', async () => {
    const ctx = makeService();
    await trackFailedBuild(ctx);
    expect(ctx.shown).toHaveLength(1);

    const result = await ctx.service.rerunFailedJobs(RUN_ID);
    expect(result.ok).toBe(true);
    expect(ctx.ado.retryBuildCalls).toBe(1);
    const resumed = (await ctx.repo.getTrackedRuns())[0];
    expect(resumed.isActive).toBe(true);
    expect(resumed.pendingRetry).toBeDefined();

    // ADO still reports the old attempt: stay active, no notification.
    await ctx.service.pollAll();
    expect((await ctx.repo.getTrackedRuns())[0].isActive).toBe(true);
    expect(ctx.shown).toHaveLength(1);

    // Rerun finishes successfully with attempt 2 without being observed in progress.
    ctx.ado.build = { id: 1, status: 'completed', result: 'succeeded', definition: { name: 'CI' } };
    ctx.ado.timeline = {
      records: [
        { ...failedStage, result: 'succeeded', attempt: 2 },
        { ...failedJob, result: 'succeeded', attempt: 2 },
      ],
    };
    await ctx.service.pollAll();
    const run = (await ctx.repo.getTrackedRuns())[0];
    expect(run.isActive).toBe(false);
    expect(run.pendingRetry).toBeUndefined();
    expect(
      ctx.shown.some((id) => id.includes('pipelineCompleted') && id.endsWith('attempt2')),
    ).toBe(true);
    expect(ctx.shown.some((id) => id.includes('stageCompleted') && id.endsWith('attempt2'))).toBe(
      true,
    );
  });

  it('notifies a repeated failure after a rerun', async () => {
    const ctx = makeService();
    await trackFailedBuild(ctx);
    await ctx.service.rerunFailedJobs(RUN_ID);
    ctx.ado.build = { id: 1, status: 'inProgress', result: 'none' };
    await ctx.service.pollAll();
    ctx.ado.build = { id: 1, status: 'completed', result: 'failed' };
    ctx.ado.timeline = {
      records: [
        { ...failedStage, attempt: 2 },
        { ...failedJob, attempt: 2 },
      ],
    };
    await ctx.service.pollAll();
    expect(ctx.shown.filter((id) => id.includes('pipelineFailed'))).toHaveLength(2);
  });

  it('rejects rerun for a build that has not failed', async () => {
    const { service, ado } = makeService();
    await service.trackByUrl(URL);
    const result = await service.rerunFailedJobs(RUN_ID);
    expect(result.ok).toBe(false);
    expect(ado.retryBuildCalls).toBe(0);
  });

  it('surfaces ADO errors and keeps the run stopped', async () => {
    const ctx = makeService();
    await trackFailedBuild(ctx);
    ctx.ado.retryFails = true;
    const result = await ctx.service.rerunFailedJobs(RUN_ID);
    expect(result.ok).toBe(false);
    expect((await ctx.repo.getTrackedRuns())[0].isActive).toBe(false);
  });

  it('retries a failed stage by its reference name', async () => {
    const ctx = makeService();
    await trackFailedBuild(ctx);
    const result = await ctx.service.retryStage(RUN_ID, 's1');
    expect(result.ok).toBe(true);
    expect(ctx.ado.retryStageCalls).toEqual(['test']);
    expect((await ctx.repo.getTrackedRuns())[0].isActive).toBe(true);
  });

  it('rejects retry for a stage that did not fail', async () => {
    const ctx = makeService();
    ctx.ado.timeline = { records: [{ ...failedStage, result: 'succeeded' }] };
    ctx.ado.build = { id: 1, status: 'completed', result: 'succeeded' };
    await ctx.service.trackByUrl(URL);
    expect((await ctx.service.retryStage(RUN_ID, 's1')).ok).toBe(false);
    expect(ctx.ado.retryStageCalls).toHaveLength(0);
  });
});

describe('TrackerService.pollAll', () => {
  it('notifies and auto-stops when a build completes', async () => {
    const { service, repo, ado, shown } = makeService();
    // Start in progress with one running stage.
    ado.build = { id: 1, status: 'inProgress', result: 'none', definition: { name: 'CI' } };
    ado.timeline = {
      records: [{ id: 's1', type: 'Stage', name: 'Build', state: 'inProgress', order: 1 }],
    };
    await service.trackByUrl(URL);

    // Progress to completed/succeeded.
    ado.build = { id: 1, status: 'completed', result: 'succeeded', definition: { name: 'CI' } };
    ado.timeline = {
      records: [
        {
          id: 's1',
          type: 'Stage',
          name: 'Build',
          state: 'completed',
          result: 'succeeded',
          order: 1,
        },
      ],
    };
    await service.pollAll();

    const runs = await repo.getTrackedRuns();
    expect(runs[0].isActive).toBe(false);
    expect(runs[0].result).toBe('succeeded');
    // stageCompleted + pipelineCompleted notifications.
    expect(shown.length).toBeGreaterThanOrEqual(2);

    const history = await repo.getHistory();
    expect(history.some((e) => e.type === 'pipelineCompleted')).toBe(true);
  });

  it('signals the build-finished listener once when a build finishes', async () => {
    const { service, ado, finished } = makeService();
    await service.trackByUrl(URL);
    await service.pollAll();
    expect(finished).toHaveLength(0);
    ado.build = { id: 1, status: 'completed', result: 'failed' };
    await service.pollAll();
    await service.pollAll();
    expect(finished).toEqual(['org/proj/1:failed']);
  });

  it('does not signal the listener for a build already finished when added', async () => {
    const { service, ado, finished } = makeService();
    ado.build = { id: 1, status: 'completed', result: 'succeeded' };
    await service.trackByUrl(URL);
    expect(finished).toHaveLength(0);
  });

  it('does not duplicate a pipeline notification across polls', async () => {
    const { service, repo, ado, shown } = makeService();
    ado.build = { id: 1, status: 'inProgress', result: 'none' };
    await service.trackByUrl(URL);

    ado.build = { id: 1, status: 'completed', result: 'failed' };
    await service.pollAll();
    const afterFirst = shown.length;
    // Poll again — run is now inactive so it should not be polled/notified again.
    await service.pollAll();
    expect(shown.length).toBe(afterFirst);
    const runs = await repo.getTrackedRuns();
    expect(runs[0].isActive).toBe(false);
  });

  it('surfaces an error message when the build cannot be fetched', async () => {
    const { service, repo, ado } = makeService();
    await service.trackByUrl(URL);
    ado.buildFails = 'auth';
    await service.pollAll();
    const runs = await repo.getTrackedRuns();
    expect(runs[0].errorMessage).toBeDefined();
    expect(runs[0].isActive).toBe(true); // still active; will retry next cycle
  });
});
