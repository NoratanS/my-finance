import { problemMessages } from '../api/problemMessages';
import type { CurrencyResult, ResultEnvelope } from '../api/types';
import { Card } from '../components/Card';
import type { CategoryNode } from '../api/types';
import { nothingMatched } from './nothingMatched';
import { ResultRenderer } from './renderers/ResultRenderer';
import { seriesColors } from './renderers/chartTheme';

/**
 * Plan-problem prefixes mapped to the chip that can fix them. Only the
 * documented common case is wired up (docs/INSIGHTS.md's example problem is a
 * stale categoryId) — other problems still show, just without an Edit button.
 */
function chipIdForProblem(problem: string): string | undefined {
  return problem.startsWith('filters.categoryId') ? 'chip-category' : undefined;
}

/** Execute failures the explorer has something specific to say about. */
export function ExecutionError({ error }: { error: unknown }) {
  const { banner, problemList, slug } = problemMessages(error, { withCode: true });

  if (slug === 'analytics-unavailable') {
    return (
      // Operational state, not a bug (docs/API.md "Status code summary") — everything else in
      // the app keeps working, so the copy stays calm, not alarming. Wording carries the exact
      // substring docs/API.md:1145 pins ("the analytics service isn't running"), lowercase and
      // mid-sentence — the brief's sample sentence capitalizes it at the start and loses that.
      <div className="error-box" role="alert" style={{ marginTop: 12 }}>
        Analytics is offline right now — the analytics service isn't running. Everything else in the
        app still works; try Run again once it's back up.
      </div>
    );
  }

  if (problemList.length > 0) {
    return (
      <div className="error-box" role="alert" style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 6 }}>
          The analytics service rejected this plan — edit a chip and run again:
        </div>
        <ul className="ins-problems">
          {problemList.map((problem) => {
            const chipId = chipIdForProblem(problem);
            return (
              <li key={problem}>
                {problem}
                {chipId && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ marginLeft: 8, padding: '1px 10px', fontSize: 12 }}
                    onClick={() => document.getElementById(chipId)?.focus()}
                  >
                    Edit
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="error-box" role="alert" style={{ marginTop: 12 }}>
      {banner}
    </div>
  );
}

/**
 * A zero-filled chart is a correct answer, not an empty state — but saying so
 * beats letting the user wonder whether the chart failed to load. Having
 * *nothing* in the range is a different answer, so each collection has to hold
 * something before it can be all zero: `[].every()` is `true`.
 */
function isAllZero(result: CurrencyResult): boolean {
  switch (result.shape) {
    case 'value':
      return parseFloat(result.value) === 0;
    case 'timeseries':
      return (
        result.points.length > 0 && result.points.every((point) => parseFloat(point.value) === 0)
      );
    case 'breakdown':
      return (
        result.groups.length > 0 && result.groups.every((group) => parseFloat(group.value) === 0)
      );
    case 'timeseriesSplit':
      return (
        result.series.length > 0 &&
        result.series.every((series) =>
          series.points.every((point) => parseFloat(point.value) === 0),
        )
      );
  }
}

/**
 * The outcome of the last successful Run: one card per pinned currency (chart
 * or table), or the empty-answer message when nothing matched at all (J15).
 * The series colours read `lastEnvelope.plan` — the plan that was actually
 * *executed*, not whatever the chip bar has drafted since — so the chart and
 * its colours always describe the same run. Do not thread the live plan in here.
 */
export function ResultsPanel({
  lastEnvelope,
  pending,
  view,
  setView,
  byId,
}: {
  lastEnvelope: ResultEnvelope;
  pending: boolean;
  view: 'chart' | 'table';
  setView: (view: 'chart' | 'table') => void;
  byId: Map<number, CategoryNode>;
}) {
  return (
    <div aria-busy={pending} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {nothingMatched(lastEnvelope) ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <p className="text-muted" style={{ margin: 0 }}>
            No transactions match this plan — an empty answer is still an answer. Widen the range or
            clear the category chip.
          </p>
        </Card>
      ) : (
        lastEnvelope.results.map((result) => (
          <Card key={result.currency} style={{ padding: '18px 20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <div className="kicker">{result.currency}</div>
              <span className="seg">
                {(['chart', 'table'] as const).map((mode) => (
                  <button
                    key={mode}
                    className={`seg-btn${view === mode ? ' active' : ''}`}
                    aria-pressed={view === mode}
                    onClick={() => setView(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </span>
            </div>
            {/* Reads the EXECUTED plan, not the chip bar's live one. A chip
                edit does not clear lastEnvelope, so the chart keeps showing the
                last Run — and a colour scheme taken from the live plan would
                describe something the reader cannot see. */}
            <ResultRenderer
              result={result}
              colorFor={seriesColors(byId, lastEnvelope.plan.groupBy)}
              view={view}
            />
            {isAllZero(result) && (
              <p className="text-muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
                Every bucket in this range is zero.
              </p>
            )}
          </Card>
        ))
      )}
      {lastEnvelope.meta.truncatedGroups && (
        <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
          Only the top 25 groups are charted; the rest are aggregated as “Other”.
        </p>
      )}
    </div>
  );
}
