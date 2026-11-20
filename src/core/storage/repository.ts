import type { RunResult, Settings, TrackedRun, TrackerEvent } from '@shared/types';
import { CONFIG, DEFAULT_SETTINGS, STORAGE_KEYS } from '@shared/config';

/**
 * Abstraction over a key/value store so the persistence layer is testable
 * without the chrome runtime (Dependency Inversion).
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

/** chrome.storage.local-backed implementation used at runtime. */
export class ChromeLocalStore implements KeyValueStore {
  async get<T>(key: string): Promise<T | undefined> {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }
}

/**
 * Repository for all persisted extension state. Encapsulates storage keys,
 * defaults, and retention rules so callers never touch raw storage.
 */
export class Repository {
  constructor(private readonly store: KeyValueStore) {}

  async getTrackedRuns(): Promise<TrackedRun[]> {
    return (await this.store.get<TrackedRun[]>(STORAGE_KEYS.TRACKED_RUNS)) ?? [];
  }

  async saveTrackedRuns(runs: TrackedRun[]): Promise<void> {
    await this.store.set(STORAGE_KEYS.TRACKED_RUNS, runs);
  }

  async upsertTrackedRun(run: TrackedRun): Promise<void> {
    const runs = await this.getTrackedRuns();
    const index = runs.findIndex((r) => r.id === run.id);
    if (index >= 0) runs[index] = run;
    else runs.push(run);
    await this.saveTrackedRuns(runs);
  }

  async removeTrackedRun(runId: string): Promise<void> {
    const runs = await this.getTrackedRuns();
    await this.saveTrackedRuns(runs.filter((r) => r.id !== runId));
  }

  async getActiveRuns(): Promise<TrackedRun[]> {
    return (await this.getTrackedRuns()).filter((r) => r.isActive);
  }

  async getHistory(): Promise<TrackerEvent[]> {
    return (await this.store.get<TrackerEvent[]>(STORAGE_KEYS.EVENT_HISTORY)) ?? [];
  }

  /**
   * Appends events and prunes anything older than the retention window
   * (docs/behavior.md §4). Pruning on write keeps storage bounded.
   */
  async appendEvents(events: TrackerEvent[], now: number = Date.now()): Promise<void> {
    if (events.length === 0) return;
    const existing = await this.getHistory();
    const cutoff = now - CONFIG.HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const merged = [...existing, ...events].filter((e) => e.createdAt >= cutoff);
    await this.store.set(STORAGE_KEYS.EVENT_HISTORY, merged);
  }

  async pruneHistory(now: number = Date.now()): Promise<void> {
    const existing = await this.getHistory();
    const cutoff = now - CONFIG.HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const pruned = existing.filter((e) => e.createdAt >= cutoff);
    if (pruned.length !== existing.length) {
      await this.store.set(STORAGE_KEYS.EVENT_HISTORY, pruned);
    }
  }

  async clearHistory(): Promise<void> {
    await this.store.set(STORAGE_KEYS.EVENT_HISTORY, []);
  }

  /** Finished builds not yet viewed in the popup, keyed by run id (drives the badge). */
  async getUnseenFinished(): Promise<Record<string, RunResult>> {
    return (await this.store.get<Record<string, RunResult>>(STORAGE_KEYS.UNSEEN_FINISHED)) ?? {};
  }

  async saveUnseenFinished(unseen: Record<string, RunResult>): Promise<void> {
    await this.store.set(STORAGE_KEYS.UNSEEN_FINISHED, unseen);
  }

  async getSettings(): Promise<Settings> {
    const stored = await this.store.get<Partial<Settings>>(STORAGE_KEYS.SETTINGS);
    // Merge with defaults so newly added settings are backfilled safely.
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        ...(stored?.notifications ?? {}),
      },
    };
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.store.set(STORAGE_KEYS.SETTINGS, settings);
  }
}
