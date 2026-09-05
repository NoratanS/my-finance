import type { CurrencyResult } from '../../api/types';
import { BreakdownChart } from './BreakdownChart';
import { ResultTable } from './ResultTable';
import { TimeseriesChart } from './TimeseriesChart';
import { TimeseriesSplitChart } from './TimeseriesSplitChart';
import { ValueTile } from './ValueTile';

/**
 * The whole frontend contract with the executor: four shapes, one renderer
 * each, plus a table that applies to all of them. New analytics capability
 * that normalizes into these shapes costs no frontend work at all.
 */
export function ResultRenderer({
  result,
  colorFor,
  view,
}: {
  result: CurrencyResult;
  colorFor: (key: string, index: number) => string;
  view: 'chart' | 'table';
}) {
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
