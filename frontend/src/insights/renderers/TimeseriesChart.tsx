import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Point } from '../../api/types';
import { formatAmount } from '../../lib/money';
import { AXIS_PROPS, CHART_HEIGHT, GRID_PROPS, TOOLTIP_PROPS, formatTick } from './chartTheme';

/** The `timeseries` shape: one line over gap-free, zero-filled buckets. */
export function TimeseriesChart({
  currency,
  points,
  color,
}: {
  currency: string;
  points: Point[];
  color: string;
}) {
  // parseFloat is for plotting geometry only, exactly as lib/money.ts
  // sanctions: nothing here is ever sent back to the API. `raw` keeps the
  // original decimal string alongside it so the tooltip never formats the
  // float — see the formatter below.
  const data = points.map((point) => ({
    period: point.period,
    value: parseFloat(point.value) || 0,
    raw: point.value,
  }));

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="period" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={64} tickFormatter={formatTick} />
        <Tooltip
          {...TOOLTIP_PROPS}
          formatter={(_value, _name, item) => formatAmount(item.payload.raw, currency)}
        />
        <Line
          type="monotone"
          dataKey="value"
          name={currency}
          stroke={color}
          strokeWidth={2}
          dot={{ r: 2, fill: color }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
