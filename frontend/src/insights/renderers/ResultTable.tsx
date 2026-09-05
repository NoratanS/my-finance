import type { CurrencyResult } from '../../api/types';
import { formatAmount } from '../../lib/money';

/**
 * Every shape also renders as a table — the explorer's honest fallback, and
 * the only renderer that can't lose a digit (docs/INSIGHTS.md → Result shapes).
 */
export function ResultTable({ result }: { result: CurrencyResult }) {
  if (result.shape === 'value') {
    return (
      <table className="table">
        <tbody>
          <tr>
            <td>total</td>
            <td className="tnum" style={{ textAlign: 'right' }}>
              {formatAmount(result.value, result.currency)}
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  if (result.shape === 'timeseries') {
    return (
      <table className="table">
        <thead>
          <tr>
            <th>Period</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {result.points.map((point) => (
            <tr key={point.period}>
              <td>{point.period}</td>
              <td className="tnum" style={{ textAlign: 'right' }}>
                {formatAmount(point.value, result.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (result.shape === 'breakdown') {
    return (
      <table className="table">
        <thead>
          <tr>
            <th>Group</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {result.groups.map((group) => (
            <tr key={group.key}>
              <td>{group.label}</td>
              <td className="tnum" style={{ textAlign: 'right' }}>
                {formatAmount(group.value, result.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // timeseriesSplit: a row per bucket, a column per series. The executor
  // zero-fills every series over every bucket, so the first series' periods
  // are the row keys.
  const periods = result.series[0]?.points.map((point) => point.period) ?? [];
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Period</th>
          {result.series.map((series) => (
            <th key={series.key} style={{ textAlign: 'right' }}>
              {series.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {periods.map((period, index) => (
          <tr key={period}>
            <td>{period}</td>
            {result.series.map((series) => (
              <td key={series.key} className="tnum" style={{ textAlign: 'right' }}>
                {formatAmount(series.points[index]?.value ?? '0', result.currency)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
