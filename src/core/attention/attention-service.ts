import type { Logger } from '@core/logging/logger';
import type { Metrics } from '@core/metrics/metrics';
import type { Repository } from '@core/storage/repository';
import type { RunResult, TrackedRun } from '@shared/types';

/** Abstraction over the toolbar badge (chrome.action). */
export interface BadgePort {
  set(text: string, color: string): Promise<void>;
}

/** Abstraction over opening the extension popup. Resolves false if it could not open. */
export interface PopupPort {
  open(highlightRunId: string): Promise<boolean>;
}

/** Notified by the tracker whenever a tracked build reaches a terminal result. */
export interface BuildFinishedListener {
  onBuildFinished(run: TrackedRun): Promise<void>;
  onBuildTracked?(run: TrackedRun): Promise<void>;
}

export const BADGE_COLORS = {
  failed: '#cf222e',
  warning: '#9a6700',
  success: '#1a7f37',
} as const;

/**
 * In-browser attention signals for finished builds (complements desktop
 * notifications): a toolbar badge counting finished builds the user has not
 * looked at yet, and optionally auto-opening the popup.
 */
export class AttentionService implements BuildFinishedListener {
  constructor(
    private readonly repo: Repository,
    private readonly badge: BadgePort,
    private readonly popup: PopupPort,
    private readonly logger: Logger,
    private readonly metrics: Metrics,
  ) {}

  async onBuildTracked(run: TrackedRun): Promise<void> {
    const opened = await this.popup.open(run.id);
    this.metrics.increment(opened ? 'tracking_popup_opened' : 'tracking_popup_open_failed');
    this.logger.info('open popup after tracking added', { opened });
  }

  async onBuildFinished(run: TrackedRun): Promise<void> {
    const settings = await this.repo.getSettings();
    if (settings.showBadge) {
      const unseen = await this.repo.getUnseenFinished();
      unseen[run.id] = run.result;
      await this.repo.saveUnseenFinished(unseen);
      await this.syncBadge();
    }
    if (settings.openPopupOnFinish) {
      const opened = await this.popup.open(run.id);
      this.metrics.increment(opened ? 'popup_auto_opened' : 'popup_auto_open_failed');
      this.logger.info('auto-open popup on build finish', { runId: run.id, opened });
    }
  }

  /** Called when the user opens the popup: everything shown counts as seen. */
  async markAllSeen(): Promise<void> {
    const unseen = await this.repo.getUnseenFinished();
    if (Object.keys(unseen).length === 0) return;
    await this.repo.saveUnseenFinished({});
    await this.syncBadge();
    this.metrics.increment('badge_cleared');
  }

  async forget(runId: string): Promise<void> {
    const unseen = await this.repo.getUnseenFinished();
    if (!(runId in unseen)) return;
    delete unseen[runId];
    await this.repo.saveUnseenFinished(unseen);
    await this.syncBadge();
  }

  async syncBadge(): Promise<void> {
    const settings = await this.repo.getSettings();
    const results = settings.showBadge ? Object.values(await this.repo.getUnseenFinished()) : [];
    const { text, color } = badgeFor(results);
    await this.badge.set(text, color);
  }
}

/** Badge text is the unseen count; colour reflects the worst unseen result. */
export function badgeFor(results: RunResult[]): { text: string; color: string } {
  if (results.length === 0) return { text: '', color: BADGE_COLORS.success };
  const text = results.length > 9 ? '9+' : String(results.length);
  if (results.some((r) => r === 'failed')) return { text, color: BADGE_COLORS.failed };
  if (results.some((r) => r === 'canceled' || r === 'partiallySucceeded')) {
    return { text, color: BADGE_COLORS.warning };
  }
  return { text, color: BADGE_COLORS.success };
}

export class ChromeBadgePort implements BadgePort {
  async set(text: string, color: string): Promise<void> {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
  }
}

export class ChromePopupPort implements PopupPort {
  constructor(
    private readonly highlightKey: string,
    private readonly logger: Logger,
  ) {}

  async open(highlightRunId: string): Promise<boolean> {
    try {
      await chrome.storage.local.set({ [this.highlightKey]: highlightRunId });
      await chrome.action.openPopup();
      return true;
    } catch (error) {
      // Typically: no focused browser window. The badge still signals the result.
      this.logger.warn('could not auto-open popup', {
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      return false;
    }
  }
}
