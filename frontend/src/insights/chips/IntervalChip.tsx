import type { Interval } from '../../api/types';
import { INTERVALS } from '../planDefaults';

export function IntervalChip({
  value,
  onChange,
}: {
  value: Interval | null;
  onChange: (interval: Interval | null) => void;
}) {
  const known = value === null || INTERVALS.includes(value);

  return (
    <div className="ins-chip">
      <span className="ins-chip-label">per</span>
      <select
        className="ins-chip-input"
        value={value ?? 'none'}
        onChange={(e) => onChange(e.target.value === 'none' ? null : (e.target.value as Interval))}
        aria-label="Interval"
      >
        <option value="none">one total</option>
        {/* A hand-edited ?plan= may carry an interval this chip doesn't offer;
            keep it visible rather than rendering a blank select — same pattern
            as CategoryChip/RangeChip/GroupByChip. */}
        {!known && <option value={value ?? undefined}>{value}</option>}
        {INTERVALS.map((interval) => (
          <option key={interval} value={interval}>
            {interval}
          </option>
        ))}
      </select>
    </div>
  );
}
