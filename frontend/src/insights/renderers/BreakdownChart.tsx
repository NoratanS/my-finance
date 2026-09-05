import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Group } from '../../api/types';
import { formatAmount } from '../../lib/money';
import { AXIS_PROPS, CHART_HEIGHT, GRID_PROPS, TOOLTIP_PROPS, formatTick } from './chartTheme';

/** The `breakdown` shape: one bar per group, each in the group's own colour. */
export function BreakdownChart({
  currency,
  groups,
  colorFor,
}: {
  currency: string;
  groups: Group[];
  colorFor: (key: string, index: number) => string;
}) {
  const data = groups.map((group, index) => ({
    key: group.key,
    label: group.label,
    value: parseFloat(group.value) || 0,
    color: colorFor(group.key, index),
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={64} tickFormatter={formatTick} />
        <Tooltip
          {...TOOLTIP_PROPS}
          formatter={(value) => formatAmount(value as string | number, currency)}
        />
        <Bar dataKey="value" name={currency} radius={[6, 6, 0, 0]} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.key} fill={row.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
