import { describe, it, expect, vi } from 'vitest';
import {
  ChromeNotificationPort,
  Notifier,
  type NotificationPort,
} from '../src/core/notifications/notifier';
import { InMemoryMetrics } from '../src/core/metrics/metrics';
import { createLogger } from '../src/core/logging/logger';
import type { NotificationSettings, TrackerEvent } from '../src/shared/types';

function makeEvent(overrides: Partial<TrackerEvent> = {}): TrackerEvent {
  return {
    eventId: 'org/proj/1:pipelineFailed:pipeline:failed',
    runId: 'org/proj/1',
    runDisplayName: 'CI · 1',
    runUrl: 'https://dev.azure.com/org/proj/_build/results?buildId=1',
    type: 'pipelineFailed',
    result: 'failed',
    createdAt: 1000,
    notified: false,
    ...overrides,
  };
}

const allOn: NotificationSettings = {
  stageCompleted: true,
  stageFailed: true,
  pipelineCompleted: true,
  pipelineFailed: true,
};

function setup() {
  const shown: Array<{ id: string; title: string }> = [];
  const port: NotificationPort = {
    show: (id, title) => shown.push({ id, title }),
  };
  const logger = createLogger('test', 'error');
  const metrics = new InMemoryMetrics(logger);
  const notifier = new Notifier(port, logger, metrics);
  return { shown, notifier, metrics };
}

describe('Notifier', () => {
  it('shows a notification for an enabled event type', () => {
    const { shown, notifier } = setup();
    const result = notifier.notify([makeEvent()], allOn, new Set());
    expect(shown).toHaveLength(1);
    expect(result[0].notified).toBe(true);
  });

  it('suppresses events disabled in settings', () => {
    const { shown, notifier, metrics } = setup();
    const settings: NotificationSettings = { ...allOn, pipelineFailed: false };
    const result = notifier.notify([makeEvent()], settings, new Set());
    expect(shown).toHaveLength(0);
    expect(result).toHaveLength(0);
    expect(metrics.snapshot()['notification_suppressed_settings']).toBe(1);
  });

  it('dedupes events already notified', () => {
    const { shown, notifier, metrics } = setup();
    const event = makeEvent();
    const result = notifier.notify([event], allOn, new Set([event.eventId]));
    expect(shown).toHaveLength(0);
    expect(result).toHaveLength(0);
    expect(metrics.snapshot()['notification_deduped']).toBe(1);
  });

  it('includes the build result in pipeline notifications', () => {
    const show = vi.fn();
    const logger = createLogger('test', 'error');
    const notifier = new Notifier({ show }, logger, new InMemoryMetrics(logger));
    notifier.notify(
      [makeEvent({ type: 'pipelineCompleted', result: 'succeeded', eventId: 'x' })],
      allOn,
      new Set(),
    );
    expect(show).toHaveBeenCalledWith(
      'x',
      'Build completed',
      'Succeeded — CI · 1',
      expect.any(String),
      'succeeded',
    );
  });

  it.each<Pick<TrackerEvent, 'type' | 'result'>>([
    { type: 'stageFailed', result: 'failed' },
    { type: 'stageFailed', result: 'canceled' },
    { type: 'stageCompleted', result: 'succeeded' },
    { type: 'stageCompleted', result: 'partiallySucceeded' },
    { type: 'pipelineFailed', result: 'failed' },
    { type: 'pipelineFailed', result: 'canceled' },
    { type: 'pipelineCompleted', result: 'partiallySucceeded' },
  ])('passes the $result result to the port for $type', ({ type, result }) => {
    const show = vi.fn();
    const logger = createLogger('test', 'error');
    const notifier = new Notifier({ show }, logger, new InMemoryMetrics(logger));
    const event = makeEvent({ type, result });
    notifier.notify([event], allOn, new Set());
    expect(show).toHaveBeenCalledWith(
      event.eventId,
      expect.any(String),
      expect.any(String),
      event.runUrl,
      result,
    );
  });

  it('passes the run URL to the notification port', () => {
    const show = vi.fn();
    const port: NotificationPort = { show };
    const logger = createLogger('test', 'error');
    const notifier = new Notifier(port, logger, new InMemoryMetrics(logger));
    notifier.notify([makeEvent()], allOn, new Set());
    expect(show).toHaveBeenCalledWith(
      expect.any(String),
      'Build failed',
      expect.any(String),
      'https://dev.azure.com/org/proj/_build/results?buildId=1',
      'failed',
    );
  });
});

describe('ChromeNotificationPort', () => {
  it('uses result-specific icons and still opens the build when clicked', () => {
    const create = vi.fn();
    const clear = vi.fn();
    const openTab = vi.fn();
    const addListener = vi.fn();
    vi.stubGlobal('chrome', {
      notifications: { create, clear, onClicked: { addListener } },
      runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
      tabs: { create: openTab },
    });

    try {
      const port = new ChromeNotificationPort('default-icon.png');
      const results: TrackerEvent['result'][] = [
        'failed',
        'succeeded',
        'partiallySucceeded',
        'canceled',
        'none',
      ];
      for (const result of results) {
        port.show(result, 'Title', 'Message', 'https://dev.azure.com/build', result);
        expect(create).toHaveBeenLastCalledWith(result, {
          type: 'basic',
          iconUrl:
            result === 'none'
              ? 'default-icon.png'
              : `chrome-extension://test/icons/notification-${result}.png`,
          title: 'Title',
          message: 'Message',
          priority: 1,
        });
      }

      const onClick = addListener.mock.calls[0][0] as (id: string) => void;
      onClick('failed');
      expect(openTab).toHaveBeenCalledWith({ url: 'https://dev.azure.com/build' });
      expect(clear).toHaveBeenCalledWith('failed');
      onClick('failed');
      expect(openTab).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
