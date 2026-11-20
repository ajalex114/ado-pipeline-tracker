import { AdoClient } from '@core/ado/ado-client';
import {
  AttentionService,
  ChromeBadgePort,
  ChromePopupPort,
} from '@core/attention/attention-service';
import { createLogger, type Logger } from '@core/logging/logger';
import { InMemoryMetrics, type Metrics } from '@core/metrics/metrics';
import {
  ChromeNotificationPort,
  Notifier,
} from '@core/notifications/notifier';
import { ChromeLocalStore, Repository } from '@core/storage/repository';
import { TrackerService } from '@core/tracking/tracker-service';
import { STORAGE_KEYS } from '@shared/config';
import type { LogLevel } from '@shared/types';

export interface AppContainer {
  repo: Repository;
  tracker: TrackerService;
  attention: AttentionService;
  logger: Logger;
  metrics: Metrics;
}

/**
 * Composition root for the background context. Builds the concrete chrome-backed
 * implementations and wires them together. Keeping construction here means the
 * rest of the codebase depends only on abstractions.
 */
export function createContainer(logLevel: LogLevel = 'info'): AppContainer {
  const logger = createLogger('ado-tracker', logLevel);
  const metrics = new InMemoryMetrics(logger.child('metrics'));
  const repo = new Repository(new ChromeLocalStore());
  const ado = new AdoClient(logger.child('ado'));
  const iconUrl = chrome.runtime.getURL('icons/icon-128.png');
  const notifier = new Notifier(new ChromeNotificationPort(iconUrl), logger.child('notify'), metrics);
  const attentionLogger = logger.child('attention');
  const attention = new AttentionService(
    repo,
    new ChromeBadgePort(),
    new ChromePopupPort(STORAGE_KEYS.HIGHLIGHT_RUN_ID, attentionLogger),
    attentionLogger,
    metrics,
  );
  const tracker = new TrackerService(repo, ado, notifier, logger.child('tracker'), metrics, attention);
  return { repo, tracker, attention, logger, metrics };
}
