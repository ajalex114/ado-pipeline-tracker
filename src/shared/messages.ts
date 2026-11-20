import type { Settings, TrackedRun, TrackerEvent } from './types';

/**
 * Typed message protocol between UI surfaces (popup/options/content) and the
 * background service worker. A discriminated union keeps handlers exhaustive.
 */
export type RequestMessage =
  | { type: 'TRACK_BUILD_URL'; url: string }
  | { type: 'TRACK_CURRENT_TAB' }
  | { type: 'UNTRACK_RUN'; runId: string }
  | { type: 'GET_STATE' }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; settings: Settings }
  | { type: 'POLL_NOW' }
  | { type: 'MARK_FINISHED_SEEN' }
  | { type: 'REFRESH_RUN'; runId: string }
  | { type: 'RERUN_FAILED_JOBS'; runId: string }
  | { type: 'RETRY_STAGE'; runId: string; stageId: string }
  | { type: 'CLEAR_HISTORY' };

export interface AppState {
  trackedRuns: TrackedRun[];
  history: TrackerEvent[];
  settings: Settings;
  highlightRunId?: string | null;
}

export type ResponseMessage =
  | { ok: true; type: 'STATE'; state: AppState }
  | { ok: true; type: 'SETTINGS'; settings: Settings }
  | { ok: true; type: 'TRACKED'; run: TrackedRun }
  | { ok: true; type: 'OK' }
  | { ok: false; error: string };

export function isRequestMessage(value: unknown): value is RequestMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}
