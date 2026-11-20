import type { PendingReview, RunResult, RunState, StageState, TransitionType } from '@shared/types';

/** Presentation helpers shared by popup and options — pure, testable. */

export interface StatusBadge {
  label: string;
  tone: 'neutral' | 'running' | 'success' | 'warning' | 'error';
}

export function pendingReviewBadge(reviews: PendingReview[]): StatusBadge | null {
  if (reviews.length === 0) return null;
  const approval = reviews.some((review) => review.kind === 'approval');
  const review = reviews.some((item) => item.kind === 'review');
  return {
    label:
      approval && review
        ? 'Waiting for approval / review'
        : approval
          ? 'Waiting for approval'
          : 'Waiting for review',
    tone: 'warning',
  };
}

export function runStatusBadge(state: RunState, result: RunResult): StatusBadge {
  if (state !== 'completed') {
    if (state === 'inProgress') return { label: 'Running', tone: 'running' };
    if (state === 'notStarted') return { label: 'Queued', tone: 'neutral' };
    return { label: 'Unknown', tone: 'neutral' };
  }
  switch (result) {
    case 'succeeded':
      return { label: 'Succeeded', tone: 'success' };
    case 'partiallySucceeded':
      return { label: 'Partially succeeded', tone: 'warning' };
    case 'failed':
      return { label: 'Failed', tone: 'error' };
    case 'canceled':
      return { label: 'Canceled', tone: 'warning' };
    default:
      return { label: 'Completed', tone: 'neutral' };
  }
}

export function stageStatusBadge(state: StageState, result: RunResult): StatusBadge {
  if (state === 'inProgress') return { label: 'Running', tone: 'running' };
  if (state === 'pending') return { label: 'Pending', tone: 'neutral' };
  if (state === 'completed') {
    if (result === 'failed') return { label: 'Failed', tone: 'error' };
    if (result === 'canceled') return { label: 'Canceled', tone: 'warning' };
    if (result === 'partiallySucceeded') return { label: 'Partial', tone: 'warning' };
    return { label: 'Done', tone: 'success' };
  }
  return { label: 'Unknown', tone: 'neutral' };
}

const TRANSITION_LABEL: Record<TransitionType, string> = {
  stageCompleted: 'Stage completed',
  stageFailed: 'Stage failed',
  pipelineCompleted: 'Build completed',
  pipelineFailed: 'Build failed',
};

export function transitionLabel(type: TransitionType): string {
  return TRANSITION_LABEL[type];
}

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
