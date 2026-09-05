import type { GroupBy } from '../../api/types';

export function GroupByChip({
  value,
  onChange,
}: {
  value: GroupBy | null;
  onChange: (groupBy: GroupBy | null) => void;
}) {
  // `merchant` is deliberately not offered: the executor rejects it until the
  // txn.merchant column lands in Phase 4b (docs/INSIGHTS.md → Plan DSL v1), and
  // an option that always errors is not a choice.
  return (
    <div className="ins-chip">
      <span className="ins-chip-label">group by</span>
      <select
        className="ins-chip-input"
        value={value ?? 'none'}
        onChange={(e) => onChange(e.target.value === 'none' ? null : (e.target.value as GroupBy))}
        aria-label="Group by"
      >
        <option value="none">nothing</option>
        <option value="category">category</option>
      </select>
    </div>
  );
}
