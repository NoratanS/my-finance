import type { CurrencyResult, ResultEnvelope } from '../api/types';

/**
 * True when the envelope is an Empty answer: the plan matched no transactions
 * (docs/INSIGHTS.md → "Empty data is a result, not an error"). The executor
 * answers that in one of two shapes: no result entry when the plan pins no
 * currency, or one entry for the pinned currency with an empty
 * `groups`/`points`/`series` collection. A `value` result is never empty — the
 * executor sums zero rows to `"0.0000"`, and that zero is an answer. A
 * bounded-range timeseries fills every bucket in its range whether or not
 * anything matched, so only an `all`-range timeseries and the two grouped
 * shapes can be empty.
 *
 * The explorer and the pinned Dashboard tile both ask this, so the two can't
 * drift apart again (the tile once checked only for a zero-length `results`).
 */
export function nothingMatched(envelope: ResultEnvelope): boolean {
  return envelope.results.every(isEmptyResult);
}

function isEmptyResult(result: CurrencyResult): boolean {
  switch (result.shape) {
    case 'value':
      return false;
    case 'timeseries':
      return result.points.length === 0;
    case 'breakdown':
      return result.groups.length === 0;
    case 'timeseriesSplit':
      return result.series.length === 0;
  }
}
