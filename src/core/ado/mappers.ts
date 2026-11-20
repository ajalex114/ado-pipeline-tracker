import type { PendingReview, RunResult, RunState, StageInfo, StageState } from '@shared/types';
import type { AdoBuildResponse, AdoTimelineRecord } from './ado-types';

/** Maps an ADO build `status` string to our RunState vocabulary. */
export function mapRunState(status: string | undefined): RunState {
  switch ((status ?? '').toLowerCase()) {
    case 'notstarted':
    case 'postponed':
      return 'notStarted';
    case 'inprogress':
    case 'cancelling':
      return 'inProgress';
    case 'completed':
      return 'completed';
    default:
      return 'unknown';
  }
}

/** Maps an ADO `result` string to our RunResult vocabulary. */
export function mapRunResult(result: string | null | undefined): RunResult {
  switch ((result ?? '').toLowerCase()) {
    case 'succeeded':
      return 'succeeded';
    case 'partiallysucceeded':
      return 'partiallySucceeded';
    case 'failed':
      return 'failed';
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    default:
      return 'none';
  }
}

function mapStageState(state: string | undefined): StageState {
  switch ((state ?? '').toLowerCase()) {
    case 'pending':
      return 'pending';
    case 'inprogress':
      return 'inProgress';
    case 'completed':
      return 'completed';
    default:
      return 'unknown';
  }
}

/**
 * Extracts ordered stage information from a build timeline.
 * Falls back gracefully when a pipeline has no explicit stages by returning [].
 */
export function mapStages(records: AdoTimelineRecord[] | undefined): StageInfo[] {
  if (!records) return [];
  return records
    .filter((r) => (r.type ?? '').toLowerCase() === 'stage')
    .map<StageInfo>((r, index) => ({
      id: r.id,
      name: r.name?.trim() || `Stage ${index + 1}`,
      state: mapStageState(r.state),
      result: mapRunResult(r.result),
      order: typeof r.order === 'number' ? r.order : index,
      refName: r.identifier?.trim() || undefined,
      attempt: typeof r.attempt === 'number' ? r.attempt : undefined,
    }))
    .sort((a, b) => a.order - b.order);
}

/**
 * Highest attempt across all timeline records (stages, jobs, tasks). ADO bumps
 * the attempt of every retried job, so this changes whenever failed jobs rerun.
 */
export function mapRunAttempt(records: AdoTimelineRecord[] | undefined): number {
  let max = 1;
  for (const r of records ?? []) {
    if (typeof r.attempt === 'number' && r.attempt > max) max = r.attempt;
  }
  return max;
}

export function mapPendingReviews(records: AdoTimelineRecord[] | undefined): PendingReview[] {
  const byId = new Map((records ?? []).map((record) => [record.id, record]));
  const pending: PendingReview[] = [];
  for (const record of byId.values()) {
    const type = record.type?.toLowerCase();
    const task = record.task?.name?.toLowerCase();
    const kind =
      type === 'checkpoint.approval'
        ? 'approval'
        : type === 'task' && (task === 'manualvalidation' || task === 'manualintervention')
          ? 'review'
          : null;
    if (!kind || (record.result && record.result.toLowerCase() !== 'none')) continue;

    const state = record.state?.toLowerCase();
    const parent = record.parentId ? byId.get(record.parentId) : undefined;
    // Pending tasks may simply be queued. Only a reached approval checkpoint
    // or an executing manual-validation task is evidence of a human wait.
    const waiting =
      state === 'inprogress' ||
      (kind === 'approval' && state === 'pending' && parent?.state?.toLowerCase() === 'inprogress');
    if (!waiting) continue;

    let ancestor = parent;
    let stage: AdoTimelineRecord | undefined;
    let inactive = false;
    const visited = new Set([record.id]);
    while (ancestor && !visited.has(ancestor.id)) {
      visited.add(ancestor.id);
      if (ancestor.state?.toLowerCase() === 'completed') inactive = true;
      if (ancestor.type?.toLowerCase() === 'stage') stage = ancestor;
      ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
    }
    // Attempts are scoped to each record: a retried stage can still have an
    // active approval on attempt 1. Ancestor lifecycle, not attempt equality,
    // determines whether this wait is still relevant.
    if (inactive) continue;
    pending.push({ id: record.id, kind, stageId: stage?.id });
  }
  return pending;
}

export function resolveDisplayName(build: AdoBuildResponse, fallback: string): string {
  const def = build.definition?.name?.trim();
  const num = build.buildNumber?.trim();
  if (def && num) return `${def} · ${num}`;
  if (def) return def;
  if (num) return num;
  return fallback;
}
