import type { Logger } from '@core/logging/logger';
import type { Metrics } from '@core/metrics/metrics';
import type { NotificationSettings, RunResult, TrackerEvent, TransitionType } from '@shared/types';

/** Abstraction over the notification transport (testable, swappable). */
export interface NotificationPort {
  show(id: string, title: string, message: string, url: string, result: RunResult): void;
}

/** chrome.notifications-backed implementation. */
export class ChromeNotificationPort implements NotificationPort {
  private static readonly urlById = new Map<string, string>();
  private static listenerBound = false;

  constructor(private readonly iconUrl: string) {
    if (!ChromeNotificationPort.listenerBound) {
      chrome.notifications.onClicked.addListener((clickedId) => {
        const url = ChromeNotificationPort.urlById.get(clickedId);
        if (url) {
          void chrome.tabs.create({ url });
          chrome.notifications.clear(clickedId);
          ChromeNotificationPort.urlById.delete(clickedId);
        }
      });
      ChromeNotificationPort.listenerBound = true;
    }
  }

  show(id: string, title: string, message: string, url: string, result: RunResult): void {
    ChromeNotificationPort.urlById.set(id, url);
    chrome.notifications.create(id, {
      type: 'basic',
      iconUrl:
        result === 'none'
          ? this.iconUrl
          : chrome.runtime.getURL(`icons/notification-${result}.png`),
      title,
      message,
      priority: 1,
    });
  }
}

const TITLES: Record<TransitionType, string> = {
  stageCompleted: 'Stage completed',
  stageFailed: 'Stage failed',
  pipelineCompleted: 'Build completed',
  pipelineFailed: 'Build failed',
};

function settingEnabled(settings: NotificationSettings, type: TransitionType): boolean {
  return settings[type];
}

function buildMessage(event: TrackerEvent): string {
  if (event.type === 'stageCompleted' || event.type === 'stageFailed') {
    return `${event.stageName ?? 'Stage'} — ${event.runDisplayName}`;
  }
  return `${RESULT_LABELS[event.result]} — ${event.runDisplayName}`;
}

const RESULT_LABELS: Record<TrackerEvent['result'], string> = {
  succeeded: 'Succeeded',
  partiallySucceeded: 'Partially succeeded',
  failed: 'Failed',
  canceled: 'Canceled',
  none: 'Finished',
};

/**
 * Decides whether events should surface as desktop notifications, honoring:
 *  - user settings (per transition type),
 *  - dedupe (already-notified events via a persistent seen-set).
 *
 * Returns the events that were actually notified so the caller can mark them.
 */
export class Notifier {
  constructor(
    private readonly port: NotificationPort,
    private readonly logger: Logger,
    private readonly metrics: Metrics,
  ) {}

  notify(
    events: TrackerEvent[],
    settings: NotificationSettings,
    alreadyNotified: ReadonlySet<string>,
  ): TrackerEvent[] {
    const notified: TrackerEvent[] = [];
    for (const event of events) {
      if (alreadyNotified.has(event.eventId)) {
        this.metrics.increment('notification_deduped', { type: event.type });
        continue;
      }
      if (!settingEnabled(settings, event.type)) {
        this.metrics.increment('notification_suppressed_settings', { type: event.type });
        this.logger.debug('notification suppressed by settings', { type: event.type });
        continue;
      }
      this.port.show(
        event.eventId,
        TITLES[event.type],
        buildMessage(event),
        event.runUrl,
        event.result,
      );
      this.metrics.increment('notification_emitted', { type: event.type });
      this.logger.info('notification emitted', { runId: event.runId, type: event.type });
      notified.push({ ...event, notified: true });
    }
    return notified;
  }
}
