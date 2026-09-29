import type { DriftEvent } from '../api/types';

/**
 * "Biedronka overtook Lidl in 2026-08" — the lead change the executor found
 * between the last two complete buckets (docs/INSIGHTS.md → Drift on pinned
 * insights). Stateless: it is re-derived on every execution, so there is nothing
 * to dismiss and nothing to store.
 */
export function DriftBadge({ drift }: { drift: DriftEvent[] | undefined }) {
  const event = drift?.[0];
  if (!event) return null;
  return (
    <div className="tag tag-accent" style={{ marginTop: 8, fontSize: 12 }}>
      {event.leader.label} overtook {event.previousLeader.label} in {event.period}
    </div>
  );
}
