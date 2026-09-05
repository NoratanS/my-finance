import type { CategoryNode } from '../../api/types';
import { categoryOptions } from '../../lib/categoryColor';

export function CategoryChip({
  categories,
  value,
  onChange,
}: {
  categories: CategoryNode[];
  value: number | undefined;
  onChange: (categoryId: number | undefined) => void;
}) {
  const options = categoryOptions(categories);
  // A saved plan can carry a category that has since been deleted. Showing it
  // as "unknown category #999" keeps the stale chip visible instead of
  // silently snapping the plan to "all categories" behind the user's back.
  const dangling = value !== undefined && !options.some((option) => option.id === value);

  return (
    <div className="ins-chip">
      <span className="ins-chip-label">category</span>
      <select
        id="chip-category"
        className="ins-chip-input"
        value={value === undefined ? 'all' : String(value)}
        onChange={(e) => onChange(e.target.value === 'all' ? undefined : Number(e.target.value))}
        aria-label="Category"
      >
        <option value="all">all categories</option>
        {dangling && <option value={value}>unknown category #{value}</option>}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
