import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseBuildRunUrl } from '@core/ado/url-parser';
import { getActiveTabUrl, sendMessage } from '@shared/client';
import type { AppState, RequestMessage } from '@shared/messages';
import { TrackedRunCard } from './components/TrackedRunCard';
import { HistoryList } from './components/HistoryList';

const REFRESH_INTERVAL_MS = 5000;

export function App(): JSX.Element {
  const [state, setState] = useState<AppState | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentTabTrackable, setCurrentTabTrackable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [highlightRunId, setHighlightRunId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await sendMessage({ type: 'GET_STATE' });
    if (response.ok && response.type === 'STATE') {
      setState(response.state);
      if (response.state.highlightRunId) {
        setHighlightRunId(response.state.highlightRunId);
        window.setTimeout(() => setHighlightRunId(null), 2500);
      }
    }
  }, []);

  useEffect(() => {
    // Opening the popup means finished builds have been seen; clears the toolbar badge.
    void sendMessage({ type: 'MARK_FINISHED_SEEN' });
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    void getActiveTabUrl().then((url) => {
      setCurrentTabTrackable(Boolean(url) && parseBuildRunUrl(url ?? '').ok);
    });
  }, []);

  const trackCurrent = useCallback(async () => {
    setBusy(true);
    setError(null);
    const response = await sendMessage({ type: 'TRACK_CURRENT_TAB' });
    if (!response.ok) setError(response.error);
    await refresh();
    setBusy(false);
  }, [refresh]);

  const trackUrl = useCallback(async () => {
    if (!urlInput.trim()) return;
    setBusy(true);
    setError(null);
    const response = await sendMessage({ type: 'TRACK_BUILD_URL', url: urlInput });
    if (!response.ok) {
      setError(response.error);
    } else {
      setUrlInput('');
    }
    await refresh();
    setBusy(false);
  }, [urlInput, refresh]);

  const removeRun = useCallback(
    async (runId: string) => {
      await sendMessage({ type: 'UNTRACK_RUN', runId });
      await refresh();
    },
    [refresh],
  );

  /** Sends a per-run action and applies the returned state; resolves to an error or null. */
  const runAction = useCallback(
    async (message: RequestMessage): Promise<string | null> => {
      const response = await sendMessage(message);
      if (!response.ok) return response.error;
      if (response.type === 'STATE') setState(response.state);
      else await refresh();
      return null;
    },
    [refresh],
  );

  const refreshRun = useCallback(
    (runId: string) => runAction({ type: 'REFRESH_RUN', runId }),
    [runAction],
  );
  const rerunFailedJobs = useCallback(
    (runId: string) => runAction({ type: 'RERUN_FAILED_JOBS', runId }),
    [runAction],
  );
  const retryStage = useCallback(
    (runId: string, stageId: string) => runAction({ type: 'RETRY_STAGE', runId, stageId }),
    [runAction],
  );

  const openSettings = useCallback(() => {
    chrome.runtime.openOptionsPage();
  }, []);

  const { active, stopped } = useMemo(() => {
    const runs = state?.trackedRuns ?? [];
    return {
      active: runs.filter((r) => r.isActive).sort((a, b) => b.addedAt - a.addedAt),
      stopped: runs.filter((r) => !r.isActive).sort((a, b) => b.addedAt - a.addedAt),
    };
  }, [state]);

  return (
    <div className="popup">
      <div className="header">
        <h1>ADO Pipeline Tracker</h1>
        <button className="icon-button" onClick={openSettings}>
          Settings
        </button>
      </div>

      <div className="body">
        <button
          className="button-primary track-current"
          onClick={trackCurrent}
          disabled={!currentTabTrackable || busy}
          title={
            currentTabTrackable
              ? 'Track the build on the current page'
              : 'Open an Azure DevOps build run page to enable this'
          }
        >
          + Track Current Build
        </button>
        {!currentTabTrackable && (
          <p className="hint-text">
            Open a specific Azure DevOps build run (URL contains <code>buildId=</code>) to track it
            with one click, or paste a build URL below.
          </p>
        )}

        <div className="add-bar">
          <input
            type="text"
            placeholder="Paste an ADO build run URL…"
            value={urlInput}
            aria-label="Build run URL"
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void trackUrl();
            }}
          />
          <button className="button-primary" onClick={trackUrl} disabled={busy || !urlInput.trim()}>
            Add
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}

        <p className="section-title">Active builds ({active.length})</p>
        {active.length === 0 ? (
          <div className="empty-state">
            No builds are being tracked. Track the current build or paste a build URL to begin.
          </div>
        ) : (
          active.map((run) => (
            <TrackedRunCard
              key={run.id}
              run={run}
              onRemove={removeRun}
              onRefresh={refreshRun}
              onRerunFailedJobs={rerunFailedJobs}
              onRetryStage={retryStage}
              highlighted={highlightRunId === run.id}
            />
          ))
        )}

        {stopped.length > 0 && (
          <>
            <p className="section-title">Recently finished</p>
            {stopped.slice(0, 5).map((run) => (
              <TrackedRunCard
                key={run.id}
                run={run}
                onRemove={removeRun}
              onRefresh={refreshRun}
              onRerunFailedJobs={rerunFailedJobs}
              onRetryStage={retryStage}
                highlighted={highlightRunId === run.id}
              />
            ))}
          </>
        )}

        <p className="section-title">Recent events</p>
        <HistoryList events={state?.history ?? []} />
      </div>

      <div className="footer">
        <span className="hint-text">Polls in the background on a browser-supported cadence</span>
        <button className="icon-button" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
    </div>
  );
}
