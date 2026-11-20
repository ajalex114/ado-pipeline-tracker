import type { NotificationSettings, Settings } from './types';

/** Central place for tunable constants — keeps magic numbers out of logic. */
export const CONFIG = {
  /** Polling cadence in seconds (interview decision Q5). */
  POLL_INTERVAL_SECONDS: 30,
  /** Chrome alarm name driving the polling loop. */
  POLL_ALARM_NAME: 'ado-tracker-poll',
  /** Retention window for event history in days (interview decision Q10). */
  HISTORY_RETENTION_DAYS: 7,
  /** Maximum simultaneously active tracked runs (interview decision Q18). */
  MAX_ACTIVE_RUNS: 20,
  /** Keyboard command id declared in the manifest (interview decision Q19). */
  TRACK_CURRENT_BUILD_COMMAND: 'track-current-build',
  /** Ephemeral storage key for the next row the popup should highlight. */
  HIGHLIGHT_RUN_ID: 'highlightRunId',
} as const;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  stageCompleted: true,
  stageFailed: true,
  pipelineCompleted: true,
  pipelineFailed: true,
};

export const DEFAULT_SETTINGS: Settings = {
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
  showBadge: true,
  openPopupOnFinish: true,
  logLevel: 'info',
};

/** chrome.storage.local keys. Centralized to avoid typos across modules. */
export const STORAGE_KEYS = {
  TRACKED_RUNS: 'trackedRuns',
  EVENT_HISTORY: 'eventHistory',
  SETTINGS: 'settings',
  UNSEEN_FINISHED: 'unseenFinished',
  HIGHLIGHT_RUN_ID: 'highlightRunId',
} as const;
