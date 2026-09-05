import type { CategoryNode, GroupBy, Interval, Metric, Plan, PlanRange } from '../../api/types';
import { CategoryChip } from './CategoryChip';
import { CurrencyChip } from './CurrencyChip';
import { GroupByChip } from './GroupByChip';
import { IntervalChip } from './IntervalChip';
import { MerchantChip } from './MerchantChip';
import { MetricChip } from './MetricChip';
import { RangeChip } from './RangeChip';

/**
 * The plan, always visible and always editable. The order reads left to right
 * as the plan's own sentence does: metric, category, merchant, grouping,
 * interval, range, currency.
 */
export function ChipBar({
  plan,
  categories,
  defaultCurrency,
  onChange,
}: {
  plan: Plan;
  categories: CategoryNode[];
  defaultCurrency: string;
  onChange: (plan: Plan) => void;
}) {
  const set = (patch: Partial<Plan>) => onChange({ ...plan, ...patch });
  const setFilter = (patch: Partial<Plan['filters']>) =>
    set({ filters: { ...plan.filters, ...patch } });

  return (
    <div className="ins-chips">
      <MetricChip value={plan.metric} onChange={(metric: Metric) => set({ metric })} />
      <CategoryChip
        categories={categories}
        value={plan.filters.categoryId}
        onChange={(categoryId) => setFilter({ categoryId })}
      />
      <MerchantChip plan={plan} onChange={onChange} />
      <GroupByChip value={plan.groupBy} onChange={(groupBy: GroupBy | null) => set({ groupBy })} />
      <IntervalChip
        value={plan.interval}
        onChange={(interval: Interval | null) => set({ interval })}
      />
      <RangeChip value={plan.range} onChange={(range: PlanRange) => set({ range })} />
      <CurrencyChip
        defaultCurrency={defaultCurrency}
        value={plan.filters.currency}
        onChange={(currency) => setFilter({ currency })}
      />
    </div>
  );
}
