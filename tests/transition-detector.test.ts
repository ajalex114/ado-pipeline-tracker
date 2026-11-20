import { describe, it, expect } from 'vitest';
import {
  detectTransitions,
  transitionKey,
  type RunSnapshot,
} from '../src/core/tracking/transition-detector';
import type { TrackedRun } from '../src/shared/types';

function baseRun(overrides: Partial<TrackedRun> = {}): TrackedRun {
  return {
    id: 'org/proj/1',
    ref: { collectionBaseUrl: 'https://dev.azure.com/org', organization: 'org', project: 'proj', buildId: 1 },
    displayName: 'CI · 20240101.1',
    runUrl: 'https://dev.azure.com/org/proj/_build/results?buildId=1',
    state: 'inProgress',
    result: 'none',
    stages: [],
    isActive: true,
    addedAt: 1000,
    lastPolledAt: null,
    ...overrides,
  };
}

describe('detectTransitions', () => {
  it('emits stageCompleted when a stage first reaches completed/succeeded', () => {
    const prev = baseRun({
      stages: [{ id: 's1', name: 'Build', state: 'inProgress', result: 'none', order: 1 }],
    });
    const snapshot: RunSnapshot = {
      state: 'inProgress',
      result: 'none',
      stages: [{ id: 's1', name: 'Build', state: 'completed', result: 'succeeded', order: 1 }],
    };
    const events = detectTransitions(prev, snapshot, 2000);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('stageCompleted');
    expect(events[0].stageName).toBe('Build');
  });

  it('emits stageFailed when a stage completes with failure', () => {
    const prev = baseRun({
      stages: [{ id: 's1', name: 'Test', state: 'inProgress', result: 'none', order: 1 }],
    });
    const snapshot: RunSnapshot = {
      state: 'inProgress',
      result: 'none',
      stages: [{ id: 's1', name: 'Test', state: 'completed', result: 'failed', order: 1 }],
    };
    const events = detectTransitions(prev, snapshot, 2000);
    expect(events.map((e) => e.type)).toContain('stageFailed');
  });

  it('does not re-emit for a stage already completed', () => {
    const prev = baseRun({
      stages: [{ id: 's1', name: 'Build', state: 'completed', result: 'succeeded', order: 1 }],
    });
    const snapshot: RunSnapshot = {
      state: 'inProgress',
      result: 'none',
      stages: [{ id: 's1', name: 'Build', state: 'completed', result: 'succeeded', order: 1 }],
    };
    expect(detectTransitions(prev, snapshot, 2000)).toHaveLength(0);
  });

  it('emits pipelineCompleted when the run first becomes terminal & succeeded', () => {
    const prev = baseRun({ state: 'inProgress', result: 'none' });
    const snapshot: RunSnapshot = { state: 'completed', result: 'succeeded', stages: [] };
    const events = detectTransitions(prev, snapshot, 2000);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pipelineCompleted');
  });

  it('emits pipelineFailed when the run first becomes terminal & failed', () => {
    const prev = baseRun({ state: 'inProgress', result: 'none' });
    const snapshot: RunSnapshot = { state: 'completed', result: 'failed', stages: [] };
    const events = detectTransitions(prev, snapshot, 2000);
    expect(events[0].type).toBe('pipelineFailed');
  });

  it('does not re-emit pipeline event when already terminal', () => {
    const prev = baseRun({ state: 'completed', result: 'succeeded' });
    const snapshot: RunSnapshot = { state: 'completed', result: 'succeeded', stages: [] };
    expect(detectTransitions(prev, snapshot, 2000)).toHaveLength(0);
  });

  it('emits both a stage and pipeline event in one poll when both change', () => {
    const prev = baseRun({
      state: 'inProgress',
      result: 'none',
      stages: [{ id: 's1', name: 'Deploy', state: 'inProgress', result: 'none', order: 1 }],
    });
    const snapshot: RunSnapshot = {
      state: 'completed',
      result: 'succeeded',
      stages: [{ id: 's1', name: 'Deploy', state: 'completed', result: 'succeeded', order: 1 }],
    };
    const events = detectTransitions(prev, snapshot, 2000);
    expect(events.map((e) => e.type).sort()).toEqual(['pipelineCompleted', 'stageCompleted']);
  });

  it('re-emits pipeline and stage events when a rerun completes with a higher attempt', () => {
    const prev = baseRun({
      state: 'completed',
      result: 'failed',
      attempt: 1,
      stages: [{ id: 's1', name: 'Test', state: 'completed', result: 'failed', order: 1, attempt: 1 }],
    });
    const snapshot: RunSnapshot = {
      state: 'completed',
      result: 'succeeded',
      attempt: 2,
      stages: [{ id: 's1', name: 'Test', state: 'completed', result: 'succeeded', order: 1, attempt: 2 }],
    };
    const events = detectTransitions(prev, snapshot, 2000);
    expect(events.map((e) => e.eventId).sort()).toEqual([
      'org/proj/1:pipelineCompleted:pipeline:succeeded:attempt2',
      'org/proj/1:stageCompleted:s1:succeeded:attempt2',
    ]);
  });

  it('does not treat a missing attempt baseline as a rerun', () => {
    const prev = baseRun({ state: 'completed', result: 'failed' });
    const snapshot: RunSnapshot = { state: 'completed', result: 'failed', attempt: 2, stages: [] };
    expect(detectTransitions(prev, snapshot, 2000)).toHaveLength(0);
  });

  it('produces deterministic dedupe keys', () => {
    const key = transitionKey('org/proj/1', 'pipelineCompleted', undefined, 'succeeded');
    expect(key).toBe('org/proj/1:pipelineCompleted:pipeline:succeeded');
  });
});
