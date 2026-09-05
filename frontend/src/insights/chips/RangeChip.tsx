import type { PlanRange } from '../../api/types';
import { RANGE_OPTIONS, rangeOptionValue } from '../planDefaults';

export function RangeChip({
  value,
  onChange,
}: {
  value: PlanRange;
  onChange: (range: PlanRange) => void;
}) {
  const selected = rangeOptionValue(value);
  const known = RANGE_OPTIONS.some((option) => option.value === selected);

  return (
    <div className="ins-chip">
      <span className="ins-chip-label">range</span>
      <select
        className="ins-chip-input"
        value={selected}
        onChange={(e) => {
          const option = RANGE_OPTIONS.find((candidate) => candidate.value === e.target.value);
          if (option) onChange(option.range);
        }}
        aria-label="Range"
      >
        {/* A template or hand-edited URL may carry a range the chip doesn't
            offer (an absolute window, say); keep it visible rather than
            rewriting the plan on render. */}
        {!known && <option value={selected}>{selected}</option>}
        {RANGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
