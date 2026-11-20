import type { TrackerEvent } from '@shared/types';
import { formatRelativeTime, transitionLabel } from '@shared/view-model';

interface Props {
  events: TrackerEvent[];
}

function toneFor(event: TrackerEvent): string {
  if (event.type === 'pipelineFailed' || event.type === 'stageFailed') return 'chip--error';
  if (event.type === 'pipelineCompleted') return 'chip--success';
  return 'chip--neutral';
}

/** Compact recent-events list (last 7 days, most recent first). */
export function HistoryList({ events }: Props): JSX.Element {
  if (events.length === 0) {
    return <p className="hint-text">No recent events yet.</p>;
  }
  return (
    <div>
      {events.slice(0, 15).map((event) => (
        <div className="history-item" key={`${event.eventId}:${event.createdAt}`}>
          <div className="history-main" title={event.runDisplayName}>
            <span className={`chip ${toneFor(event)}`}>{transitionLabel(event.type)}</span>{' '}
            {event.stageName ? `${event.stageName} · ` : ''}
            <a className="link" href={event.runUrl} target="_blank" rel="noreferrer">
              {event.runDisplayName}
            </a>
          </div>
          <span className="hint-text">{formatRelativeTime(event.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}
