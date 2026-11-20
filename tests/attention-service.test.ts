import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  AttentionService,
  ChromePopupPort,
  BADGE_COLORS,
  badgeFor,
  type BadgePort,
  type PopupPort,
} from '../src/core/attention/attention-service';
import { Repository, type KeyValueStore } from '../src/core/storage/repository';
import { InMemoryMetrics } from '../src/core/metrics/metrics';
import { createLogger } from '../src/core/logging/logger';
import { DEFAULT_SETTINGS } from '../src/shared/config';
import type { RunResult, TrackedRun } from '../src/shared/types';

class MemoryStore implements KeyValueStore {
  data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }
}

function run(id: string, result: RunResult): TrackedRun {
  return {
    id,
    ref: { collectionBaseUrl: 'x', organization: 'org', project: 'proj', buildId: 1 },
    displayName: 'CI',
    runUrl: 'x',
    state: 'completed',
    result,
    stages: [],
    isActive: false,
    addedAt: 1,
    lastPolledAt: 1,
  };
}

function setup(popupOpens = true) {
  const repo = new Repository(new MemoryStore());
  const badge = { text: '', color: '' };
  const badgePort: BadgePort = {
    set: async (text, color) => {
      badge.text = text;
      badge.color = color;
    },
  };
  const opened: string[] = [];
  const popupPort: PopupPort = {
    open: async (id) => {
      opened.push(id);
      return popupOpens;
    },
  };
  const logger = createLogger('test', 'error');
  const metrics = new InMemoryMetrics(logger);
  const service = new AttentionService(repo, badgePort, popupPort, logger, metrics);
  return { repo, badge, opened, service, metrics };
}

describe('badgeFor', () => {
  it('is empty with no unseen builds and caps the count at 9+', () => {
    expect(badgeFor([]).text).toBe('');
    expect(badgeFor(Array(12).fill('succeeded')).text).toBe('9+');
  });

  it('uses the worst result for the colour', () => {
    expect(badgeFor(['succeeded']).color).toBe(BADGE_COLORS.success);
    expect(badgeFor(['succeeded', 'canceled']).color).toBe(BADGE_COLORS.warning);
    expect(badgeFor(['partiallySucceeded', 'failed']).color).toBe(BADGE_COLORS.failed);
  });
});

describe('AttentionService', () => {
  it('opens the tracking confirmation independently of finish settings without changing the badge', async () => {
    const { service, repo, badge, opened, metrics } = setup();
    await repo.saveSettings({ ...DEFAULT_SETTINGS, showBadge: false, openPopupOnFinish: false });
    await service.onBuildTracked(run('a', 'succeeded'));
    expect(opened).toEqual(['a']);
    expect(badge.text).toBe('');
    expect(await repo.getUnseenFinished()).toEqual({});
    expect(metrics.snapshot()['tracking_popup_opened']).toBe(1);
  });

  it('records a failed tracking popup without failing tracking', async () => {
    const { service, metrics } = setup(false);
    await expect(service.onBuildTracked(run('a', 'succeeded'))).resolves.toBeUndefined();
    expect(metrics.snapshot()['tracking_popup_open_failed']).toBe(1);
  });

  it('counts finished builds on the badge and opens the popup highlighting the run', async () => {
    const { service, badge, opened } = setup();
    await service.onBuildFinished(run('a', 'succeeded'));
    await service.onBuildFinished(run('b', 'failed'));
    expect(badge.text).toBe('2');
    expect(badge.color).toBe(BADGE_COLORS.failed);
    expect(opened).toEqual(['a', 'b']);
  });

  describe('ChromePopupPort', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('persists the highlight before opening the browser popup', async () => {
      const set = vi.fn().mockResolvedValue(undefined);
      const openPopup = vi.fn().mockImplementation(async () => {
        expect(set).toHaveBeenCalledWith({ highlight: 'a' });
      });
      vi.stubGlobal('chrome', { storage: { local: { set } }, action: { openPopup } });
      const port = new ChromePopupPort('highlight', createLogger('test', 'error'));
      expect(await port.open('a')).toBe(true);
      expect(openPopup).toHaveBeenCalledOnce();
    });

    it('retains the saved highlight when Edge rejects popup opening', async () => {
      const set = vi.fn().mockResolvedValue(undefined);
      const openPopup = vi.fn().mockRejectedValue(new Error('No focused window'));
      vi.stubGlobal('chrome', { storage: { local: { set } }, action: { openPopup } });
      const port = new ChromePopupPort('highlight', createLogger('test', 'error'));
      expect(await port.open('a')).toBe(false);
      expect(set).toHaveBeenCalledWith({ highlight: 'a' });
    });
  });

  it('counts a rerun of the same build once', async () => {
    const { service, badge } = setup();
    await service.onBuildFinished(run('a', 'failed'));
    await service.onBuildFinished(run('a', 'succeeded'));
    expect(badge.text).toBe('1');
    expect(badge.color).toBe(BADGE_COLORS.success);
  });

  it('clears the badge when finished builds are seen or untracked', async () => {
    const { service, badge } = setup();
    await service.onBuildFinished(run('a', 'failed'));
    await service.onBuildFinished(run('b', 'succeeded'));
    await service.forget('a');
    expect(badge.text).toBe('1');
    await service.markAllSeen();
    expect(badge.text).toBe('');
  });

  it('honours settings for badge and auto-open', async () => {
    const { service, repo, badge, opened } = setup();
    await repo.saveSettings({ ...DEFAULT_SETTINGS, showBadge: false, openPopupOnFinish: false });
    await service.onBuildFinished(run('a', 'failed'));
    expect(badge.text).toBe('');
    expect(opened).toHaveLength(0);
  });

  it('records when the popup could not be opened', async () => {
    const { service, metrics } = setup(false);
    await service.onBuildFinished(run('a', 'failed'));
    expect(metrics.snapshot()['popup_auto_open_failed']).toBe(1);
  });
});
