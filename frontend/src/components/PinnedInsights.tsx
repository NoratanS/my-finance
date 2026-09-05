import { Link } from 'react-router-dom';
import { useCategories, useInsightResults, useInsights } from '../api/hooks';
import { describePlan, planToSearch } from '../insights/planDefaults';
import { ResultRenderer } from '../insights/renderers/ResultRenderer';
import { seriesColors } from '../insights/renderers/chartTheme';
import { flattenTree } from '../lib/categoryColor';
import { Card } from './Card';

/**
 * Pinned insights, executed on load, as dashboard tiles. Additive by design:
 * with nothing pinned this renders nothing and the dashboard is unchanged.
 */
export function PinnedInsights() {
  const { data: categories } = useCategories();
  const insights = useInsights();
  // The server already sorts pinned first; filtering keeps the tile order.
  const pinned = (insights.data ?? []).filter((insight) => insight.pinned);
  const results = useInsightResults(pinned);

  if (pinned.length === 0) return null;
  const byId = flattenTree(categories ?? []);

  return (
    <div style={{ marginTop: 28 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 14,
        }}
      >
        <h4 style={{ margin: 0 }}>Pinned insights</h4>
        <Link to="/insights" style={{ fontSize: 13 }}>
          Explore
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
        {pinned.map((insight, index) => {
          const query = results[index];
          const envelope = query?.data;
          const categoryName =
            insight.plan.filters.categoryId !== undefined
              ? byId.get(insight.plan.filters.categoryId)?.name
              : undefined;
          return (
            <Card key={insight.id} style={{ padding: '18px 20px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 14 }}>{insight.name}</span>
                <Link
                  to={`/insights?insight=${insight.id}&plan=${encodeURIComponent(planToSearch(insight.plan))}`}
                  style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                >
                  Open
                </Link>
              </div>
              <div className="text-muted" style={{ fontSize: 12, margin: '2px 0 12px' }}>
                {describePlan(insight.plan, categoryName)}
              </div>
              {envelope && envelope.results.length > 0 ? (
                envelope.results.map((result) => (
                  <ResultRenderer
                    key={result.currency}
                    result={result}
                    colorFor={seriesColors(byId, insight.plan.groupBy)}
                    view={insight.viz?.chart === 'table' ? 'table' : 'chart'}
                  />
                ))
              ) : (
                <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                  {query?.isError
                    ? 'Could not run this insight.'
                    : envelope
                      ? 'No transactions match this plan.'
                      : '…'}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
