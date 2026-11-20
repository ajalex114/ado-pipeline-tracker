import { describe, it, expect, beforeEach } from 'vitest';
import { Repository, type KeyValueStore } from '../src/core/storage/repository';
import { CONFIG, DEFAULT_SETTINGS } from '../src/shared/config';
import type { TrackerEvent } from '../src/shared/types';

class MemoryStore implements KeyValueStore {
  private data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }
}

function evt(id: string, createdAt: number): TrackerEvent {
  return {
    eventId: id,
    runId: 'org/proj/1',
    runDisplayName: 'CI',
    runUrl: 'https://example',
    type: 'pipelineCompleted',
    result: 'succeeded',
    createdAt,
    notified: true,
  };
}

describe('Repository history retention', () => {
  let repo: Repository;
  const now = 10_000_000_000;
  const retentionMs = CONFIG.HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  beforeEach(() => {
    repo = new Repository(new MemoryStore());
  });

  it('keeps events within the retention window and prunes older ones on append', async () => {
    const fresh = evt('fresh', now - 1000);
    const stale = evt('stale', now - retentionMs - 1000);
    await repo.appendEvents([stale], now);
    await repo.appendEvents([fresh], now);
    const history = await repo.getHistory();
    expect(history.map((e) => e.eventId)).toEqual(['fresh']);
  });

  it('pruneHistory removes stale events', async () => {
    await repo.appendEvents([evt('a', now), evt('b', now - retentionMs - 1)], now);
    // Both appended relative to `now`; b is stale and pruned during append already.
    await repo.pruneHistory(now);
    const history = await repo.getHistory();
    expect(history.every((e) => e.createdAt >= now - retentionMs)).toBe(true);
  });

  it('clearHistory empties the log', async () => {
    await repo.appendEvents([evt('a', now)], now);
    await repo.clearHistory();
    expect(await repo.getHistory()).toEqual([]);
  });
});

describe('Repository settings', () => {
  it('returns defaults when nothing stored', async () => {
    const repo = new Repository(new MemoryStore());
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('backfills missing notification keys from defaults', async () => {
    const store = new MemoryStore();
    await store.set('settings', { logLevel: 'debug', notifications: { pipelineFailed: false } });
    const repo = new Repository(store);
    const settings = await repo.getSettings();
    expect(settings.logLevel).toBe('debug');
    expect(settings.notifications.pipelineFailed).toBe(false);
    expect(settings.notifications.stageCompleted).toBe(true); // backfilled
  });
});

describe('Repository tracked runs', () => {
  it('upserts and removes runs', async () => {
    const repo = new Repository(new MemoryStore());
    const run = {
      id: 'org/proj/1',
      ref: { collectionBaseUrl: 'x', organization: 'org', project: 'proj', buildId: 1 },
      displayName: 'CI',
      runUrl: 'x',
      state: 'inProgress' as const,
      result: 'none' as const,
      stages: [],
      isActive: true,
      addedAt: 1,
      lastPolledAt: null,
    };
    await repo.upsertTrackedRun(run);
    expect(await repo.getActiveRuns()).toHaveLength(1);
    await repo.upsertTrackedRun({ ...run, displayName: 'CI updated' });
    const runs = await repo.getTrackedRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].displayName).toBe('CI updated');
    await repo.removeTrackedRun('org/proj/1');
    expect(await repo.getTrackedRuns()).toHaveLength(0);
  });
});
