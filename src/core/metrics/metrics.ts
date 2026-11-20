import type { Logger } from '@core/logging/logger';

/**
 * Usage metrics collector.
 *
 * Captures privacy-safe product usage counters to understand adoption and
 * behavior (interview + Copilot instructions). v1 keeps an in-memory counter
 * map and mirrors events to the logger; the interface is transport-agnostic so
 * a real analytics sink can be added later without touching call sites.
 */
export type MetricName =
  | 'build_tracked_added'
  | 'build_tracked_duplicate'
  | 'build_track_rejected_invalid_url'
  | 'build_track_rejected_cap_reached'
  | 'track_current_build_clicked'
  | 'track_current_build_shortcut'
  | 'build_untracked'
  | 'poll_cycle_completed'
  | 'poll_run_error'
  | 'notification_emitted'
  | 'notification_suppressed_settings'
  | 'notification_deduped'
  | 'tracking_auto_stopped'
  | 'tracking_reactivated'
  | 'build_refreshed_manual'
  | 'rerun_requested'
  | 'rerun_started'
  | 'rerun_failed'
  | 'rerun_rejected_state'
  | 'rerun_not_observed'
  | 'popup_auto_opened'
  | 'popup_auto_open_failed'
  | 'tracking_popup_opened'
  | 'tracking_popup_open_failed'
  | 'build_human_wait_detected'
  | 'badge_cleared'
  | 'settings_updated'
  | 'history_cleared';

export type MetricDimensions = Record<string, string | number | boolean>;

export interface Metrics {
  increment(name: MetricName, dimensions?: MetricDimensions): void;
  snapshot(): Record<string, number>;
}

export class InMemoryMetrics implements Metrics {
  private readonly counters = new Map<string, number>();

  constructor(private readonly logger: Logger) {}

  increment(name: MetricName, dimensions?: MetricDimensions): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + 1);
    this.logger.debug('metric', { name, dimensions });
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters.entries());
  }
}
