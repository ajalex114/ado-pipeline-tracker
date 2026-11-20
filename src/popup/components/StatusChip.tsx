import type { StatusBadge } from '@shared/view-model';

/** Small pill showing a colored status label. */
export function StatusChip({ badge }: { badge: StatusBadge }): JSX.Element {
  return <span className={`chip chip--${badge.tone}`}>{badge.label}</span>;
}
