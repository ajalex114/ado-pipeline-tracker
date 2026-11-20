import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { mapPendingReviews, mapStages } from '../src/core/ado/mappers';
import { TrackedRunCard } from '../src/popup/components/TrackedRunCard';
import type { TrackedRun } from '../src/shared/types';

const run: TrackedRun = {
  id: 'org/project/1',
  ref: {
    collectionBaseUrl: 'https://dev.azure.com/org',
    organization: 'org',
    project: 'project',
    buildId: 1,
  },
  displayName: 'CI',
  runUrl: 'https://dev.azure.com/org/project/_build/results?buildId=1',
  state: 'inProgress',
  result: 'none',
  stages: [{ id: 'stage', name: 'Deploy', state: 'pending', result: 'none', order: 1 }],
  isActive: true,
  addedAt: 1,
  lastPolledAt: 1,
  pendingReviews: [{ id: 'approval', kind: 'approval', stageId: 'stage' }],
};

function render(tracked: TrackedRun): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    createElement(TrackedRunCard, {
      run: tracked,
      onRemove: () => undefined,
      onRefresh: async () => null,
      onRerunFailedJobs: async () => null,
      onRetryStage: async () => null,
    }),
  );
  return host;
}

describe('TrackedRunCard human waits', () => {
  it('shows the review button for an approval on attempt 1 beneath a stage on attempt 2', () => {
    const records = [
      { id: 'stage', type: 'Stage', name: 'Deploy', state: 'pending', attempt: 2 },
      { id: 'checkpoint', type: 'Checkpoint', parentId: 'stage', state: 'inProgress', attempt: 1 },
      {
        id: 'approval',
        type: 'Checkpoint.Approval',
        parentId: 'checkpoint',
        state: 'inProgress',
        result: null,
        attempt: 1,
      },
    ];
    const host = render({
      ...run,
      stages: mapStages(records),
      pendingReviews: mapPendingReviews(records),
    });
    expect(host.querySelector('.card-header .chip')?.textContent).toBe('Waiting for approval');
    expect(host.querySelector('.stage-row .chip')?.textContent).toBe('Waiting for approval');
    expect(host.querySelector('.review-action')?.textContent).toBe('Review in Azure DevOps');
  });

  it('highlights the build and affected stage with an actionable approval label', () => {
    const host = render(run);
    expect(host.querySelector('.card--waiting')).not.toBeNull();
    expect(host.querySelector('.card-header .chip')?.textContent).toBe('Waiting for approval');
    expect(host.querySelector('.stage-row .chip')?.textContent).toBe('Waiting for approval');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Review and respond');
    const reviewLink = host.querySelector<HTMLAnchorElement>('.review-action');
    expect(reviewLink?.textContent).toBe('Review in Azure DevOps');
    expect(reviewLink?.href).toBe(run.runUrl);
    expect(reviewLink?.target).toBe('_blank');
    expect(reviewLink?.rel).toBe('noreferrer');
    expect(reviewLink?.classList.contains('button-primary')).toBe(true);
  });

  it('labels manual review and retains the last known wait alongside a fetch error', () => {
    const host = render({
      ...run,
      pendingReviews: [{ id: 'manual', kind: 'review', stageId: 'stage' }],
      errorMessage: 'Timeline unavailable',
    });
    expect(host.querySelector('.stage-row .chip')?.textContent).toBe('Waiting for review');
    expect(host.querySelector('.error-text')?.textContent).toBe('Timeline unavailable');
    expect(host.querySelector('.review-action')?.textContent).toBe('Review in Azure DevOps');
  });

  it('does not highlight queued builds, finished builds or pending reruns as waiting', () => {
    for (const tracked of [
      { ...run, pendingReviews: [] },
      { ...run, state: 'completed' as const, result: 'succeeded' as const, isActive: false },
      { ...run, pendingRetry: { requestedAt: 1, fromAttempt: 1 } },
    ]) {
      const host = render(tracked);
      expect(host.querySelector('.card--waiting')).toBeNull();
      expect(host.querySelector('.review-action')).toBeNull();
      expect(host.querySelector('a')?.textContent).toBe('Open in Azure DevOps ↗');
    }
  });

  it('preserves the build results view when opening the review page', () => {
    const runUrl = `${run.runUrl}&view=results`;
    const host = render({ ...run, runUrl });
    expect(host.querySelector<HTMLAnchorElement>('.review-action')?.href).toBe(runUrl);
  });
});
