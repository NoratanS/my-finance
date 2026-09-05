// Chart rows for the two timeseries renderers.
//
// Recharts wants one row per bucket. The dashed forecast tail is a second data
// key rather than a second chart: the last observed bucket carries BOTH
// values, so the solid line and the dashed one meet instead of leaving a gap.
//
// Every row also carries the bucket's original decimal string(s) under a
// `raw` / `<key>__raw` companion field. `observed`/`projected` are parsed to
// numbers for chart geometry only (lib/money.ts's rule); the two renderers'
// Tooltip formatters read the companion field back so a displayed amount is
// never the float.

import type { Point, Series } from '../api/types';

export interface TimeseriesRow {
  period: string;
  observed: number | null;
  projected: number | null;
  anomaly: boolean;
  /** The bucket's original decimal string. Observed and projected are mutually
   *  exclusive except at the join bucket, where they're equal — one field
   *  covers both. */
  raw: string;
}

/** Suffix for a series' dashed forecast key in a timeseriesSplit chart. */
export const FORECAST_SUFFIX = '~forecast';

export function timeseriesRows(points: Point[]): TimeseriesRow[] {
  const hasProjection = points.some((p) => p.projected);
  const lastObserved = points.reduce((last, p, i) => (p.projected ? last : i), -1);
  return points.map((p, i) => ({
    period: p.period,
    observed: p.projected ? null : parseFloat(p.value),
    projected: p.projected || (hasProjection && i === lastObserved) ? parseFloat(p.value) : null,
    anomaly: p.anomaly === true,
    raw: p.value,
  }));
}

export interface SplitRow {
  period: string;
  [seriesKey: string]: number | string | null;
}

/**
 * One row per bucket, two numeric keys per series: `key` (solid) and
 * `key + FORECAST_SUFFIX` (dashed) — each paired with a `<dataKey>__raw`
 * decimal string, the convention `TimeseriesSplitChart`'s tooltip already
 * used before this change. Series are gap-free over the same buckets, so
 * index alignment is safe.
 */
export function splitRows(series: Series[]): SplitRow[] {
  const built = series.map((s) => ({ key: s.key, rows: timeseriesRows(s.points) }));
  const periods = built[0]?.rows.map((r) => r.period) ?? [];
  return periods.map((period, index) => {
    const row: SplitRow = { period };
    for (const { key, rows } of built) {
      const r = rows[index];
      const raw = r?.raw ?? '0';
      row[key] = r?.observed ?? null;
      row[`${key}__raw`] = raw;
      row[key + FORECAST_SUFFIX] = r?.projected ?? null;
      row[`${key}${FORECAST_SUFFIX}__raw`] = raw;
    }
    return row;
  });
}
