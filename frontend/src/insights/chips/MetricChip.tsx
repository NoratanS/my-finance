import type { Metric } from '../../api/types';
import { METRICS } from '../planDefaults';

export function MetricChip({
  value,
  onChange,
}: {
  value: Metric;
  onChange: (metric: Metric) => void;
}) {
  const known = METRICS.includes(value);

  return (
    <div className="ins-chip">
      <span className="ins-chip-label">metric</span>
      <select
        className="ins-chip-input"
        value={value}
        onChange={(e) => onChange(e.target.value as Metric)}
        aria-label="Metric"
      >
        {/* A hand-edited ?plan= may carry a metric this chip doesn't offer
            (planFromSearch only checks that it is a string); keep it visible
            rather than rendering a blank select — same pattern as
            CategoryChip/RangeChip/GroupByChip. */}
        {!known && <option value={value}>{value}</option>}
        {METRICS.map((metric) => (
          <option key={metric} value={metric}>
            {metric}
          </option>
        ))}
      </select>
    </div>
  );
}
