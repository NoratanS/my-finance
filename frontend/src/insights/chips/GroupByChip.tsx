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
  const known = value === null || value === 'category';

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
        {/* A saved plan or hand-edited URL may carry a groupBy this chip
            doesn't offer (e.g. `merchant`); keep it visible rather than
            rendering a blank select — same pattern as CategoryChip/RangeChip. */}
        {!known && <option value={value ?? undefined}>{value}</option>}
        <option value="category">category</option>
      </select>
    </div>
  );
}
