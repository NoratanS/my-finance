import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Series } from '../../api/types';
import { formatAmount } from '../../lib/money';
import { AXIS_PROPS, CHART_HEIGHT, GRID_PROPS, TOOLTIP_PROPS, formatTick } from './chartTheme';

/**
 * The `timeseriesSplit` shape: one line per series — or grouped bars when there
 * are three or fewer buckets, because a line joining two dots is a worse chart
 * than two bars (docs/INSIGHTS.md → Result shapes).
 *
 * Every series carries a point for every bucket (the executor zero-fills per
 * series), so the first series' periods drive the rows.
 */
export function TimeseriesSplitChart({
  currency,
  series,
  colorFor,
}: {
  currency: string;
  series: Series[];
  colorFor: (key: string, index: number) => string;
}) {
  const periods = series[0]?.points.map((point) => point.period) ?? [];
  // parseFloat is for plotting geometry only; each series' original decimal
  // string rides along under a `__raw` suffix so the tooltip (keyed off
  // `item.dataKey`, since several series share one row) never formats the
  // float.
  const data = periods.map((period, index) => {
    const row: Record<string, string | number> = { period };
    for (const one of series) {
      const raw = one.points[index]?.value ?? '0';
      row[one.key] = parseFloat(raw) || 0;
      row[`${one.key}__raw`] = raw;
    }
    return row;
  });
  const margin = { top: 8, right: 12, left: 4, bottom: 0 };
  const rawFor = (item: { dataKey?: unknown; payload?: Record<string, string | number> }) =>
    formatAmount(item.payload?.[`${String(item.dataKey)}__raw`] ?? 0, currency);

  if (periods.length <= 3) {
    return (
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} margin={margin}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="period" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} width={64} tickFormatter={formatTick} />
          <Tooltip
            {...TOOLTIP_PROPS}
            formatter={(_value, _name, item) => rawFor(item)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((one, index) => (
            <Bar
              key={one.key}
              dataKey={one.key}
              name={one.label}
              fill={colorFor(one.key, index)}
              radius={[6, 6, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={data} margin={margin}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="period" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={64} tickFormatter={formatTick} />
        <Tooltip
          {...TOOLTIP_PROPS}
          formatter={(_value, _name, item) => rawFor(item)}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((one, index) => (
          <Line
            key={one.key}
            type="monotone"
            dataKey={one.key}
            name={one.label}
            stroke={colorFor(one.key, index)}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
