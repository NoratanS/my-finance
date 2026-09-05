import type { Metric } from '../../api/types';
import { METRICS } from '../planDefaults';

export function MetricChip({
  value,
  onChange,
}: {
  value: Metric;
  onChange: (metric: Metric) => void;
}) {
  return (
    <div className="ins-chip">
      <span className="ins-chip-label">metric</span>
      <select
        className="ins-chip-input"
        value={value}
        onChange={(e) => onChange(e.target.value as Metric)}
        aria-label="Metric"
      >
        {METRICS.map((metric) => (
          <option key={metric} value={metric}>
            {metric}
          </option>
        ))}
      </select>
    </div>
  );
}
