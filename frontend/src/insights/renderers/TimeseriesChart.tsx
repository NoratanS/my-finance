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
import { timeseriesRows, type TimeseriesRow } from '../chartRows';
import { AXIS_PROPS, CHART_HEIGHT, GRID_PROPS, TOOLTIP_PROPS, formatTick } from './chartTheme';

const ANOMALY_COLOR = '#eeaabc'; // the same rose Budgets uses for "over"

/** Recharts dot renderer: nothing extra on an ordinary bucket, a rose ring on an outlier. */
function AnomalyDot({
  cx,
  cy,
  payload,
  color,
}: {
  cx?: number;
  cy?: number;
  payload?: TimeseriesRow;
  color: string;
}) {
  if (cx === undefined || cy === undefined) return null;
  // Stage 1 draws a small filled dot on every bucket. Returning null for
  // ordinary points would silently delete all of them; this only *adds* the
  // outlier ring.
  // Matches what `dot={{ r: 2, fill: color }}` rendered before the ring existed:
  // Recharts' own Dot carries these classes and inherits the line's stroke, and
  // dropping them made every ordinary dot a shade lighter than Stage 1's.
  if (!payload?.anomaly)
    return (
      <circle
        className="recharts-dot recharts-line-dot"
        cx={cx}
        cy={cy}
        r={2}
        fill={color}
        stroke={color}
      />
    );
  // The hole reads as a hole only against the card it sits on, which is
  // --color-surface; --color-bg is the page behind the card.
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="var(--color-surface)"
      stroke={ANOMALY_COLOR}
      strokeWidth={2}
    />
  );
}

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
  const rows = timeseriesRows(points);

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="period" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} width={64} tickFormatter={formatTick} />
        <Tooltip
          {...TOOLTIP_PROPS}
          formatter={(_value, _name, item) => formatAmount(item.payload.raw, currency)}
        />
        <Line
          type="monotone"
          dataKey="observed"
          name={currency}
          stroke={color}
          strokeWidth={2}
          dot={<AnomalyDot color={color} />}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="projected"
          name={`${currency} (forecast)`}
          stroke={color}
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
          legendType="none"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
