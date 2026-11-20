/**
 * Canonical domain types shared across background, UI, and core modules.
 * Keep this free of chrome-specific or React-specific imports.
 */

/** Lifecycle state of a build run as surfaced by the extension. */
export type RunState = 'notStarted' | 'inProgress' | 'completed' | 'unknown';

/**
 * Terminal result of a build run or stage.
 * Mirrors Azure DevOps result vocabulary (superset kept intentionally small).
 */
export type RunResult = 'succeeded' | 'partiallySucceeded' | 'failed' | 'canceled' | 'none';

/** Stage-level lifecycle state used for progress rendering. */
export type StageState = 'pending' | 'inProgress' | 'completed' | 'unknown';

export interface PendingReview {
  id: string;
  kind: 'approval' | 'review';
  stageId?: string;
}

/** A single stage within a tracked build run. */
export interface StageInfo {
  id: string;
  name: string;
  state: StageState;
  result: RunResult;
  order: number;
  /** ADO stage reference name (YAML `stage:` id); required to retry a stage. */
  refName?: string;
  /** ADO attempt number for this stage; increments on each retry. */
  attempt?: number;
}

/**
 * Immutable identity of an Azure DevOps build run, parsed from a run URL.
 * `collectionBaseUrl` is the REST base (e.g. https://dev.azure.com/org).
 */
export interface BuildRunRef {
  collectionBaseUrl: string;
  organization: string;
  project: string;
  buildId: number;
}

/** A build run the user has chosen to track. */
export interface TrackedRun {
  /** Stable key: `${organization}/${project}/${buildId}`. */
  id: string;
  ref: BuildRunRef;
  displayName: string;
  runUrl: string;
  state: RunState;
  result: RunResult;
  stages: StageInfo[];
  /** True while actively polled; false once terminal. */
  isActive: boolean;
  addedAt: number;
  lastPolledAt: number | null;
  /** Set when the run could not be fetched (e.g. permission error). */
  errorMessage?: string;
  /** Highest job/stage attempt seen in the timeline; increments when failed jobs are rerun. */
  attempt?: number;
  /**
   * Set after the user requests a rerun, until ADO reports the new attempt.
   * Prevents a stale terminal status from immediately auto-stopping the run.
   */
  pendingRetry?: { requestedAt: number; fromAttempt: number };
  /** Explicit approval checkpoints or running manual validation tasks. */
  pendingReviews?: PendingReview[];
}

/** Types of transitions the tracker can detect and notify on. */
export type TransitionType =
  'stageCompleted' | 'stageFailed' | 'pipelineCompleted' | 'pipelineFailed';

/** A detected change worth recording and potentially notifying. */
export interface TrackerEvent {
  eventId: string;
  runId: string;
  runDisplayName: string;
  runUrl: string;
  type: TransitionType;
  stageName?: string;
  result: RunResult;
  createdAt: number;
  notified: boolean;
}

/** User-configurable notification toggles, keyed by transition type. */
export interface NotificationSettings {
  stageCompleted: boolean;
  stageFailed: boolean;
  pipelineCompleted: boolean;
  pipelineFailed: boolean;
}

/** Persisted user settings. */
export interface Settings {
  notifications: NotificationSettings;
  /** Show a count of finished, not-yet-viewed builds on the toolbar icon. */
  showBadge: boolean;
  /** Open the extension popup automatically when a tracked build finishes. */
  openPopupOnFinish: boolean;
  /** Log verbosity for the in-extension logger. */
  logLevel: LogLevel;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const TERMINAL_RESULTS: readonly RunResult[] = [
  'succeeded',
  'partiallySucceeded',
  'failed',
  'canceled',
];

export function isTerminalResult(result: RunResult): boolean {
  return TERMINAL_RESULTS.includes(result);
}
