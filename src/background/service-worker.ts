import { createContainer, type AppContainer } from '@core/container';
import { createLogger } from '@core/logging/logger';
import type { RunActionResult } from '@core/tracking/tracker-service';
import { CONFIG, STORAGE_KEYS } from '@shared/config';
import {
  isRequestMessage,
  type AppState,
  type RequestMessage,
  type ResponseMessage,
} from '@shared/messages';

/**
 * Background service worker — the tab-independent engine.
 *
 * MV3 service workers are ephemeral: they may be torn down and restarted at any
 * time. All durable state therefore lives in chrome.storage (via Repository),
 * and the container is rebuilt on demand. Polling is driven by chrome.alarms so
 * it survives worker suspension and does NOT depend on any open tab
 * (docs/behavior.md §2, §5).
 */

let container: AppContainer | null = null;
const bootstrapLogger = createLogger('ado-tracker:bootstrap');

async function getContainer(): Promise<AppContainer> {
  if (container) return container;
  const bootstrap = createContainer();
  const settings = await bootstrap.repo.getSettings();
  container = createContainer(settings.logLevel);
  return container;
}

function ensurePollAlarm(): void {
  // Some Chromium builds clamp alarms to a 1 minute minimum. Use the browser-
  // supported interval so the worker keeps activating reliably.
  const requestedMinutes = CONFIG.POLL_INTERVAL_SECONDS / 60;
  const supportedMinutes = Math.max(1, requestedMinutes);
  if (supportedMinutes !== requestedMinutes) {
    bootstrapLogger.warn('poll interval clamped to browser minimum', {
      requestedSeconds: CONFIG.POLL_INTERVAL_SECONDS,
      supportedMinutes,
    });
  }
  chrome.alarms.create(CONFIG.POLL_ALARM_NAME, {
    periodInMinutes: supportedMinutes,
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensurePollAlarm();
  void getContainer().then((c) => {
    c.logger.info('extension installed');
    return c.attention.syncBadge();
  });
});

chrome.runtime.onStartup.addListener(() => {
  ensurePollAlarm();
  void getContainer().then((c) => {
    c.logger.info('browser startup — resuming tracking');
    // Badge text is not persisted across browser restarts; restore it.
    return c.attention.syncBadge().then(() => c.tracker.pollAll());
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== CONFIG.POLL_ALARM_NAME) return;
  void getContainer().then((c) => c.tracker.pollAll());
});

/** Keyboard shortcut handler (interview decisions Q16, Q19). */
chrome.commands.onCommand.addListener((command) => {
  if (command !== CONFIG.TRACK_CURRENT_BUILD_COMMAND) return;
  void trackActiveTab('track_current_build_shortcut');
});

async function trackActiveTab(
  source: 'track_current_build_shortcut' | 'track_current_build_clicked',
) {
  const c = await getContainer();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    c.logger.warn('no active tab URL for track-current-build');
    return { ok: false as const, message: 'No active tab to read a build URL from.' };
  }
  c.metrics.increment(source);
  const result = await c.tracker.trackByUrl(tab.url);
  ensurePollAlarm();
  return result;
}

async function consumeHighlightRunId(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.HIGHLIGHT_RUN_ID);
  const runId = result[STORAGE_KEYS.HIGHLIGHT_RUN_ID] as string | undefined;
  if (runId) {
    await chrome.storage.local.remove(STORAGE_KEYS.HIGHLIGHT_RUN_ID);
    return runId;
  }
  return null;
}

async function buildState(c: AppContainer): Promise<AppState> {
  const [trackedRuns, history, settings] = await Promise.all([
    c.repo.getTrackedRuns(),
    c.repo.getHistory(),
    c.repo.getSettings(),
  ]);
  // Most-recent history first for display.
  history.sort((a, b) => b.createdAt - a.createdAt);
  return { trackedRuns, history, settings, highlightRunId: await consumeHighlightRunId() };
}

async function toRunActionResponse(
  c: AppContainer,
  result: RunActionResult,
): Promise<ResponseMessage> {
  return result.ok
    ? { ok: true, type: 'STATE', state: await buildState(c) }
    : { ok: false, error: result.message };
}

async function handleMessage(message: RequestMessage): Promise<ResponseMessage> {
  const c = await getContainer();
  switch (message.type) {
    case 'GET_STATE':
      return { ok: true, type: 'STATE', state: await buildState(c) };

    case 'GET_SETTINGS':
      return { ok: true, type: 'SETTINGS', settings: await c.repo.getSettings() };

    case 'UPDATE_SETTINGS':
      await c.repo.saveSettings(message.settings);
      c.metrics.increment('settings_updated');
      // Rebuild container so the new log level takes effect.
      container = createContainer(message.settings.logLevel);
      await container.attention.syncBadge();
      return { ok: true, type: 'OK' };

    case 'TRACK_BUILD_URL': {
      const result = await c.tracker.trackByUrl(message.url);
      ensurePollAlarm();
      return result.ok
        ? { ok: true, type: 'TRACKED', run: result.run }
        : { ok: false, error: result.message };
    }

    case 'TRACK_CURRENT_TAB': {
      const result = await trackActiveTab('track_current_build_clicked');
      return result.ok
        ? { ok: true, type: 'TRACKED', run: result.run }
        : { ok: false, error: result.message };
    }

    case 'UNTRACK_RUN':
      await c.tracker.untrack(message.runId);
      await c.attention.forget(message.runId);
      return { ok: true, type: 'OK' };

    case 'POLL_NOW':
      await c.tracker.pollAll();
      return { ok: true, type: 'STATE', state: await buildState(c) };

    case 'REFRESH_RUN':
      return toRunActionResponse(c, await c.tracker.refreshOne(message.runId));

    case 'RERUN_FAILED_JOBS': {
      const result = await c.tracker.rerunFailedJobs(message.runId);
      if (result.ok) ensurePollAlarm();
      return toRunActionResponse(c, result);
    }

    case 'RETRY_STAGE': {
      const result = await c.tracker.retryStage(message.runId, message.stageId);
      if (result.ok) ensurePollAlarm();
      return toRunActionResponse(c, result);
    }

    case 'MARK_FINISHED_SEEN':
      await c.attention.markAllSeen();
      return { ok: true, type: 'OK' };

    case 'CLEAR_HISTORY':
      await c.repo.clearHistory();
      c.metrics.increment('history_cleared');
      return { ok: true, type: 'OK' };

    default:
      return { ok: false, error: 'Unknown message type.' };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isRequestMessage(message)) {
    sendResponse({ ok: false, error: 'Malformed message.' } satisfies ResponseMessage);
    return false;
  }
  handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Internal error.',
      } satisfies ResponseMessage);
    });
  // Return true to keep the message channel open for the async response.
  return true;
});

// Ensure the alarm exists whenever the worker is (re)loaded.
ensurePollAlarm();
