import type {
  RunResult,
  StageInfo,
  TrackedRun,
  TrackerEvent,
  TransitionType,
} from '@shared/types';
import { isTerminalResult } from '@shared/types';

/** Snapshot of the freshly-fetched run used for diffing against the stored one. */
export interface RunSnapshot {
  state: TrackedRun['state'];
  result: RunResult;
  stages: StageInfo[];
  /** Highest timeline attempt; increases when failed jobs are rerun. */
  attempt?: number;
}

/**
 * Deterministic dedupe key for a transition. Emitting the same key twice is a
 * no-op, satisfying "notify once per unique state transition" (behavior §3).
 * Attempts after the first get a suffix so a rerun can notify again.
 */
export function transitionKey(
  runId: string,
  type: TransitionType,
  stageId: string | undefined,
  result: RunResult,
  attempt: number = 1,
): string {
  const base = `${runId}:${type}:${stageId ?? 'pipeline'}:${result}`;
  return attempt > 1 ? `${base}:attempt${attempt}` : base;
}

/**
 * Pure diff between the previously stored run and the latest snapshot.
 * Returns the transitions that just occurred (no side effects, no dedupe state).
 *
 * Stage transitions are detected when a stage moves INTO the `completed` state
 * for the first time. Pipeline transitions fire when the run first becomes
 * terminal.
 */
export function detectTransitions(
  previous: TrackedRun,
  snapshot: RunSnapshot,
  now: number = Date.now(),
): TrackerEvent[] {
  const events: TrackerEvent[] = [];
  const prevStageById = new Map(previous.stages.map((s) => [s.id, s]));

  for (const stage of snapshot.stages) {
    const before = prevStageById.get(stage.id);
    const wasCompleted = before?.state === 'completed';
    const nowCompleted = stage.state === 'completed';
    const retried =
      before?.attempt !== undefined &&
      stage.attempt !== undefined &&
      stage.attempt > before.attempt;
    if (nowCompleted && (!wasCompleted || retried)) {
      const failed = stage.result === 'failed' || stage.result === 'canceled';
      events.push(
        makeEvent(previous, {
          type: failed ? 'stageFailed' : 'stageCompleted',
          stageId: stage.id,
          stageName: stage.name,
          result: stage.result,
          attempt: stage.attempt,
          now,
        }),
      );
    }
  }

  const wasTerminal = previous.state === 'completed' && isTerminalResult(previous.result);
  const nowTerminal = snapshot.state === 'completed' && isTerminalResult(snapshot.result);
  // Runs stored before attempts were tracked have no baseline; never treat that as a rerun.
  const rerun =
    previous.attempt !== undefined &&
    snapshot.attempt !== undefined &&
    snapshot.attempt > previous.attempt;
  if (nowTerminal && (!wasTerminal || rerun)) {
    const failed = snapshot.result === 'failed' || snapshot.result === 'canceled';
    events.push(
      makeEvent(previous, {
        type: failed ? 'pipelineFailed' : 'pipelineCompleted',
        result: snapshot.result,
        attempt: snapshot.attempt,
        now,
      }),
    );
  }

  return events;
}

function makeEvent(
  run: TrackedRun,
  args: {
    type: TransitionType;
    result: RunResult;
    now: number;
    stageId?: string;
    stageName?: string;
    attempt?: number;
  },
): TrackerEvent {
  return {
    eventId: transitionKey(run.id, args.type, args.stageId, args.result, args.attempt),
    runId: run.id,
    runDisplayName: run.displayName,
    runUrl: run.runUrl,
    type: args.type,
    stageName: args.stageName,
    result: args.result,
    createdAt: args.now,
    notified: false,
  };
}
