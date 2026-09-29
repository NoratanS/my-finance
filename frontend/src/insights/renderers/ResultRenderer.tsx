import type { ReactElement } from 'react';
import type { CurrencyResult } from '../../api/types';
import { BreakdownChart } from './BreakdownChart';
import { ResultTable } from './ResultTable';
import { TimeseriesChart } from './TimeseriesChart';
import { TimeseriesSplitChart } from './TimeseriesSplitChart';
import { ValueTile } from './ValueTile';

/**
 * The chart-vs-table dispatcher: the one place that switches on `shape` to
 * pick a chart renderer. `ResultTable` also branches on shape (it renders
 * every shape as a table), so this is not the *only* shape-aware code in the
 * frontend — it is the only one choosing among the four chart renderers.
 *
 * The explicit `ReactElement` return type is load-bearing: without it,
 * TypeScript infers `Element | undefined` and a missing `case` for a future
 * fifth shape would compile clean and silently render nothing. With it,
 * `noImplicitReturns`-style exhaustiveness is enforced by the switch falling
 * through to no return, not by any runtime check.
 */
export function ResultRenderer({
  result,
  colorFor,
  view,
}: {
  result: CurrencyResult;
  colorFor: (key: string, index: number) => string;
  view: 'chart' | 'table';
}): ReactElement {
  if (view === 'table') return <ResultTable result={result} />;

  switch (result.shape) {
    case 'value':
      return <ValueTile currency={result.currency} value={result.value} label="total" />;
    case 'timeseries':
      return (
        <TimeseriesChart
          currency={result.currency}
          points={result.points}
          color="var(--color-accent)"
        />
      );
    case 'breakdown':
      return (
        <BreakdownChart currency={result.currency} groups={result.groups} colorFor={colorFor} />
      );
    case 'timeseriesSplit':
      return (
        <TimeseriesSplitChart
          currency={result.currency}
          series={result.series}
          colorFor={colorFor}
        />
      );
  }
}
