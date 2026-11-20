import { useCallback, useEffect, useRef, useState } from 'react';
import { sendMessage } from '@shared/client';
import { CONFIG } from '@shared/config';
import type { LogLevel, NotificationSettings, Settings } from '@shared/types';

const NOTIFICATION_OPTIONS: Array<{
  key: keyof NotificationSettings;
  label: string;
  desc: string;
}> = [
  { key: 'stageCompleted', label: 'Stage completed', desc: 'Notify when a stage finishes successfully.' },
  { key: 'stageFailed', label: 'Stage failed', desc: 'Notify when a stage fails or is canceled.' },
  { key: 'pipelineCompleted', label: 'Build completed', desc: 'Notify when the whole build finishes.' },
  { key: 'pipelineFailed', label: 'Build failed', desc: 'Notify when the build fails or is canceled.' },
];

const IN_BROWSER_OPTIONS: Array<{
  key: 'showBadge' | 'openPopupOnFinish';
  label: string;
  desc: string;
}> = [
  {
    key: 'showBadge',
    label: 'Badge on toolbar icon',
    desc: 'Show a count of finished builds you have not viewed yet (red if any failed). Pin the extension to see it.',
  },
  {
    key: 'openPopupOnFinish',
    label: 'Open popup when a build finishes',
    desc: 'Automatically open the tracker popup, highlighting the finished build, when an Edge window is focused.',
  },
];

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export function App(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void sendMessage({ type: 'GET_SETTINGS' }).then((res) => {
      if (res.ok && res.type === 'SETTINGS') setSettings(res.settings);
    });
    return () => window.clearTimeout(savedTimer.current);
  }, []);

  const persist = useCallback(async (next: Settings) => {
    setSettings(next);
    await sendMessage({ type: 'UPDATE_SETTINGS', settings: next });
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1500);
  }, []);

  const toggleNotification = useCallback(
    (key: keyof NotificationSettings) => {
      if (!settings) return;
      void persist({
        ...settings,
        notifications: { ...settings.notifications, [key]: !settings.notifications[key] },
      });
    },
    [settings, persist],
  );

  const toggleSetting = useCallback(
    (key: 'showBadge' | 'openPopupOnFinish') => {
      if (!settings) return;
      void persist({ ...settings, [key]: !settings[key] });
    },
    [settings, persist],
  );

  const changeLogLevel = useCallback(
    (level: LogLevel) => {
      if (!settings) return;
      void persist({ ...settings, logLevel: level });
    },
    [settings, persist],
  );

  const clearHistory = useCallback(async () => {
    await sendMessage({ type: 'CLEAR_HISTORY' });
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1500);
  }, []);

  if (!settings) {
    return (
      <div className="page">
        <p>Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>ADO Pipeline Tracker</h1>
      <p className="subtitle">Configure how and when you are notified about tracked build runs.</p>

      <section className="section">
        <h2>Notifications</h2>
        {NOTIFICATION_OPTIONS.map((opt) => (
          <div className="toggle-row" key={opt.key}>
            <span className="toggle-label">
              <strong>{opt.label}</strong>
              <span className="desc">{opt.desc}</span>
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.notifications[opt.key]}
                onChange={() => toggleNotification(opt.key)}
                aria-label={opt.label}
              />
              <span className="slider" />
            </label>
          </div>
        ))}
      </section>

      <section className="section">
        <h2>In-browser alerts</h2>
        {IN_BROWSER_OPTIONS.map((opt) => (
          <div className="toggle-row" key={opt.key}>
            <span className="toggle-label">
              <strong>{opt.label}</strong>
              <span className="desc">{opt.desc}</span>
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings[opt.key]}
                onChange={() => toggleSetting(opt.key)}
                aria-label={opt.label}
              />
              <span className="slider" />
            </label>
          </div>
        ))}
      </section>

      <section className="section">
        <h2>Keyboard shortcut</h2>
        <ul className="info-list">
          <li>
            Default shortcut to track the build on the current page: <code>Alt+Shift+B</code>.
          </li>
          <li>
            Change it at <code>edge://extensions/shortcuts</code> (Edge) or{' '}
            <code>chrome://extensions/shortcuts</code> (Chrome).
          </li>
        </ul>
      </section>

      <section className="section">
        <h2>Tracking &amp; history</h2>
        <ul className="info-list">
          <li>Active builds are polled in the background on a browser-supported cadence.</li>
          <li>Up to {CONFIG.MAX_ACTIVE_RUNS} builds can be tracked at once.</li>
          <li>Tracking stops automatically when a build finishes.</li>
          <li>Event history is kept for {CONFIG.HISTORY_RETENTION_DAYS} days.</li>
        </ul>
        <div className="toggle-row">
          <span className="toggle-label">
            <strong>Clear event history</strong>
            <span className="desc">Remove all recorded events immediately.</span>
          </span>
          <button className="icon-button" onClick={() => void clearHistory()}>
            Clear
          </button>
        </div>
      </section>

      <section className="section">
        <h2>Diagnostics</h2>
        <div className="toggle-row">
          <span className="toggle-label">
            <strong>Log level</strong>
            <span className="desc">Controls console logging verbosity. No sensitive data is logged.</span>
          </span>
          <select
            value={settings.logLevel}
            onChange={(e) => changeLogLevel(e.target.value as LogLevel)}
            aria-label="Log level"
          >
            {LOG_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="saved">{saved ? 'Saved ✓' : ''}</div>
    </div>
  );
}
