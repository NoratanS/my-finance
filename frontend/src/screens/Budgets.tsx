import { useActiveProfile, useBudgets, useBudgetStatuses, useCategories } from '../api/hooks';
import { Card } from '../components/Card';
import { ProgressBar } from '../components/ProgressBar';
import { effectiveColor, flattenTree } from '../lib/categoryColor';
import { currentMonth, formatAmount, formatShortDate, todayIso } from '../lib/money';

const OVER_COLOR = '#eeaabc';

export function Budgets() {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const budgets = useBudgets(todayIso());
  const statuses = useBudgetStatuses(budgets.data);

  if (!profile) return null;
  const byId = flattenTree(categories ?? []);
  const list = budgets.data ?? [];
  const month = currentMonth();

  return (
    <main>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '26px 0 18px',
        }}
      >
        <h2 style={{ margin: 0 }}>Budgets</h2>
        <span className="text-muted" style={{ fontSize: 13 }}>
          active in {month.label} · subtree spend, one currency per budget
        </span>
      </div>
      {list.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
          {list.map((budget, i) => {
            const status = statuses[i]?.data;
            const over = status?.overBudget ?? false;
            const percent = status?.percentUsed ?? 0;
            const color = over ? OVER_COLOR : effectiveColor(byId, budget.category.id);
            return (
              <Card key={budget.id} style={{ padding: '18px 20px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <div
                      style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 20 }}
                    >
                      {budget.category.name}
                    </div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {formatShortDate(budget.periodStart)} – {formatShortDate(budget.periodEnd)}{' '}
                      {budget.periodEnd.slice(0, 4)} · includes subcategories
                    </div>
                  </div>
                  {over ? (
                    <span className="tag tag-outline">over budget</span>
                  ) : (
                    <span className="tag tag-accent">
                      {status ? `${Math.round(percent)}% used` : '…'}
                    </span>
                  )}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <ProgressBar percent={percent} color={color} large />
                </div>
                <div
                  className="tnum"
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}
                >
                  <span>
                    spent <strong>{status ? formatAmount(status.spent, budget.currency) : '…'}</strong>
                  </span>
                  <span className="text-muted">
                    {over ? 'over by' : 'remaining'}{' '}
                    <strong style={{ color: 'var(--color-text)' }}>
                      {status
                        ? formatAmount(
                            Math.abs(parseFloat(status.remaining)),
                            budget.currency,
                          )
                        : '…'}
                    </strong>
                  </span>
                  <span className="text-muted">
                    limit {formatAmount(budget.amountLimit, budget.currency)}
                  </span>
                </div>
                {status && status.excludedCurrencies.length > 0 && (
                  <div className="error-box" style={{ marginTop: 10, fontSize: 12 }}>
                    Transactions in {status.excludedCurrencies.join(', ')} are not counted — this
                    budget only sums {budget.currency}.
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <p className="text-muted" style={{ margin: 0 }}>
            No budgets yet for {profile.name}. Budgets set a spending limit for a category over a
            date range.
          </p>
        </Card>
      )}
    </main>
  );
}
