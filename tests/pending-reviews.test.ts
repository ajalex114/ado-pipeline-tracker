import { describe, expect, it } from 'vitest';
import { mapPendingReviews } from '../src/core/ado/mappers';
import { pendingReviewBadge } from '../src/shared/view-model';
import type { AdoTimelineRecord } from '../src/core/ado/ado-types';

const stage: AdoTimelineRecord = {
  id: 'stage',
  type: 'Stage',
  state: 'pending',
  attempt: 1,
};
const checkpoint: AdoTimelineRecord = {
  id: 'checkpoint',
  parentId: stage.id,
  type: 'Checkpoint',
  state: 'inProgress',
};
const approval: AdoTimelineRecord = {
  id: 'approval',
  parentId: checkpoint.id,
  type: 'Checkpoint.Approval',
  state: 'inProgress',
};
const manual: AdoTimelineRecord = {
  id: 'manual',
  parentId: 'job',
  type: 'Task',
  state: 'inProgress',
  name: 'Custom display name',
  task: { name: 'ManualValidation' },
};

describe('mapPendingReviews', () => {
  it('finds approval checkpoints and manual tasks through their stage ancestry', () => {
    expect(
      mapPendingReviews([
        stage,
        checkpoint,
        approval,
        { id: 'job', parentId: stage.id, type: 'Job', state: 'inProgress' },
        manual,
      ]),
    ).toEqual([
      { id: 'approval', kind: 'approval', stageId: 'stage' },
      { id: 'manual', kind: 'review', stageId: 'stage' },
    ]);
  });

  it('supports manual intervention without guessing from display names', () => {
    expect(
      mapPendingReviews([
        { ...manual, task: { name: 'ManualIntervention' } },
        { ...manual, id: 'script', name: 'Waiting for approval', task: { name: 'Bash' } },
      ]),
    ).toEqual([{ id: 'manual', kind: 'review', stageId: undefined }]);
  });

  it('only treats pending approvals as reached when their checkpoint is running', () => {
    expect(mapPendingReviews([stage, checkpoint, { ...approval, state: 'pending' }])).toHaveLength(
      1,
    );
    expect(
      mapPendingReviews([
        stage,
        { ...checkpoint, state: 'pending' },
        { ...approval, state: 'pending' },
        { ...manual, state: 'pending' },
      ]),
    ).toEqual([]);
  });

  it('keeps active approvals when the stage has a higher independent attempt counter', () => {
    expect(
      mapPendingReviews([
        { ...stage, attempt: 2 },
        { ...checkpoint, attempt: 1 },
        { ...approval, attempt: 1, result: null },
      ]),
    ).toEqual([{ id: 'approval', kind: 'approval', stageId: 'stage' }]);
  });

  it('keeps running manual validations when their stage has a higher attempt counter', () => {
    expect(
      mapPendingReviews([
        { ...stage, state: 'inProgress', attempt: 2 },
        { id: 'job', parentId: stage.id, type: 'Job', state: 'inProgress', attempt: 1 },
        { ...manual, attempt: 1 },
      ]),
    ).toEqual([{ id: 'manual', kind: 'review', stageId: 'stage' }]);
  });

  it('ignores automated checks, resolved approvals and completed ancestors', () => {
    expect(
      mapPendingReviews([
        { ...stage, attempt: 2 },
        checkpoint,
        { ...approval, id: 'automated', type: 'Checkpoint.Evaluation' },
        { ...approval, id: 'done', state: 'completed', result: 'succeeded' },
        { ...approval, id: 'failed', result: 'failed' },
      ]),
    ).toEqual([]);
    expect(mapPendingReviews([{ ...stage, state: 'completed' }, checkpoint, approval])).toEqual([]);
    expect(mapPendingReviews([stage, { ...checkpoint, state: 'completed' }, approval])).toEqual([]);
  });

  it('handles missing timelines, duplicate records and malformed ancestry safely', () => {
    expect(mapPendingReviews(undefined)).toEqual([]);
    expect(mapPendingReviews([approval, approval])).toHaveLength(1);
    expect(mapPendingReviews([{ ...manual, parentId: manual.id }])).toHaveLength(1);
  });
});

describe('pendingReviewBadge', () => {
  it('distinguishes approval, review, combined and cleared waits', () => {
    expect(pendingReviewBadge([])).toBeNull();
    expect(pendingReviewBadge([{ id: 'a', kind: 'approval' }])).toEqual({
      label: 'Waiting for approval',
      tone: 'warning',
    });
    expect(pendingReviewBadge([{ id: 'r', kind: 'review' }])?.label).toBe('Waiting for review');
    expect(
      pendingReviewBadge([
        { id: 'a', kind: 'approval' },
        { id: 'r', kind: 'review' },
      ])?.label,
    ).toBe('Waiting for approval / review');
  });
});
