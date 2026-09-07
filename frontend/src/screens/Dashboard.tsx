import { Link } from 'react-router-dom';
import {
  useActiveProfile,
  useBudgets,
  useBudgetStatuses,
  useCategories,
  useCategoryTotals,
  useTransactions,
  useTransactionSummary,
} from '../api/hooks';
import { Card, KpiTile } from '../components/Card';
import { CategoryDot } from '../components/CategoryDot';
import { PinnedInsights } from '../components/PinnedInsights';
import { ProgressBar } from '../components/ProgressBar';
import { useTxnModal } from '../components/TxnModal';
import {
  categoryPath,
  effectiveColor,
  flattenTree,
  rootOf,
} from '../lib/categoryColor';
import { currentMonth, formatAmount, formatShortDate, formatSigned, todayIso } from '../lib/money';

const OVER_COLOR = '#eeaabc';

export function Dashboard() {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const month = currentMonth();

  // KPIs and the breakdown are aggregated server-side over EVERY transaction of the
  // month. Summing a page of rows here used to drop whole categories off the chart.
  const monthSummary = useTransactionSummary({ from: month.from, to: month.to });
  const monthSpend = useCategoryTotals({ from: month.from, to: month.to, type: 'EXPENSE' });
  const recentTxns = useTransactions({ size: 6 });
  const budgets = useBudgets(todayIso());
  const snapshot = (budgets.data ?? []).slice(0, 4);
  const statuses = useBudgetStatuses(snapshot);

  if (!profile) return null;
  const currency = profile.defaultCurrency;
  const byId = flattenTree(categories ?? []);

  // One row per currency; the tiles show the profile's own and disclose the rest.
  const summaryRows = monthSummary.data ?? [];
  const totals = summaryRows.find((row) => row.currency === currency);
  const spent = parseFloat(totals?.expense ?? '0');
  const income = parseFloat(totals?.income ?? '0');
  const net = parseFloat(totals?.net ?? '0');
  const monthCount = totals?.count ?? 0;
  const foreignCount = summaryRows
    .filter((row) => row.currency !== currency)
    .reduce((total, row) => total + row.count, 0);

  // Roll the per-category expense totals up to their root category.
  const rollup = new Map<number, { name: string; sum: number; color: string }>();
  for (const row of monthSpend.data ?? []) {
    if (row.currency !== currency) continue;
    const root = rootOf(byId, row.categoryId);
    if (!root) continue;
    const entry = rollup.get(root.id) ?? {
      name: root.name,
      sum: 0,
      color: effectiveColor(byId, root.id),
    };
    entry.sum += parseFloat(row.total) || 0;
    rollup.set(root.id, entry);
  }
  const breakdown = [...rollup.entries()]
    .map(([id, entry]) => ({ id, ...entry }))
    .filter((entry) => entry.sum > 0)
    .sort((a, b) => b.sum - a.sum);
  const maxSum = Math.max(1, ...breakdown.map((b) => b.sum));

  const recent = recentTxns.data?.content ?? [];

  return (
    <main>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          margin: '26px 0 18px',
        }}
      >
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <span className="text-muted" style={{ fontSize: 13 }}>
          {month.label} · {profile.name}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        <KpiTile
          label="Spent this month"
          value={formatAmount(spent, currency)}
          sub={`${monthCount} transaction${monthCount === 1 ? '' : 's'} this month`}
        />
        <KpiTile
          label="Income this month"
          value={formatAmount(income, currency)}
          sub={income > 0 ? 'salary and other income' : 'nothing recorded'}
        />
        <KpiTile
          label="Net"
          value={(net >= 0 ? '+' : '−') + formatAmount(Math.abs(net), currency)}
          sub={
            foreignCount > 0
              ? `income minus expenses · ${foreignCount} foreign-currency txn${foreignCount > 1 ? 's' : ''} excluded`
              : 'income minus expenses'
          }
        />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '3fr 2fr',
          gap: 24,
          marginTop: 28,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <Card style={{ padding: '18px 20px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 14,
              }}
            >
              <h4 style={{ margin: 0 }}>Spend by category</h4>
              <span className="text-muted" style={{ fontSize: 12 }}>
                expenses · this month
              </span>
            </div>
            {breakdown.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {breakdown.map((b) => (
                  <div key={b.id}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        marginBottom: 4,
                      }}
                    >
                      <Link to={`/transactions?cat=${b.id}`} className="row-link">
                        <CategoryDot color={b.color} />
                        {b.name}
                      </Link>
                      <span className="tnum">{formatAmount(b.sum, currency)}</span>
                    </div>
                    <ProgressBar percent={(b.sum / maxSum) * 100} color={b.color} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                No expenses recorded this month. Add your first transaction to see the breakdown.
              </p>
            )}
          </Card>
          <Card style={{ padding: '18px 20px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 8,
              }}
            >
              <h4 style={{ margin: 0 }}>Recent transactions</h4>
              <Link to="/transactions" style={{ fontSize: 13 }}>
                View all
              </Link>
            </div>
            <table className="table">
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap', width: 70 }}>
                      {formatShortDate(t.occurredOn)}
                    </td>
                    <td>
                      <Link to={`/transactions?cat=${t.category.id}`} className="row-link">
                        <CategoryDot color={effectiveColor(byId, t.category.id)} />
                        {categoryPath(byId, t.category.id).join(' › ') || t.category.name}
                      </Link>
                    </td>
                    <td className="text-muted">{t.description || '—'}</td>
                    <td
                      className="tnum"
                      style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                    >
                      <span className={t.type === 'INCOME' ? 'amt-income' : undefined}>
                        {formatSigned(t.amount, t.currency, t.type)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recent.length === 0 && (
              <p className="text-muted" style={{ fontSize: 13, margin: '10px 0 0' }}>
                Nothing yet — this profile has no transactions.
              </p>
            )}
          </Card>
        </div>
        <Card style={{ padding: '18px 20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 14,
            }}
          >
            <h4 style={{ margin: 0 }}>Budgets</h4>
            <Link to="/budgets" style={{ fontSize: 13 }}>
              Manage
            </Link>
          </div>
          {snapshot.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {snapshot.map((budget, i) => {
                const status = statuses[i]?.data;
                const over = status?.overBudget ?? false;
                const color = over ? OVER_COLOR : effectiveColor(byId, budget.category.id);
                return (
                  <div key={budget.id}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        marginBottom: 4,
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span>{budget.category.name}</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          gap: 8,
                          alignItems: 'center',
                          whiteSpace: 'nowrap',
                          flex: 'none',
                        }}
                      >
                        {over && <span className="tag tag-outline">over</span>}
                        <span className="text-muted tnum" style={{ whiteSpace: 'nowrap' }}>
                          {status ? formatAmount(status.spent, budget.currency) : '…'} /{' '}
                          {formatAmount(budget.amountLimit, budget.currency)}
                        </span>
                      </span>
                    </div>
                    <ProgressBar percent={status?.percentUsed ?? 0} color={color} />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              No budgets yet for this profile.
            </p>
          )}
        </Card>
      </div>
      <PinnedInsights />
      <EmptyProfileHint hasTxns={recent.length > 0} loaded={recentTxns.isSuccess} />
    </main>
  );
}

/** Gentle nudge on a brand-new profile. */
function EmptyProfileHint({ hasTxns, loaded }: { hasTxns: boolean; loaded: boolean }) {
  const { openTxnModal } = useTxnModal();
  const { data: categories } = useCategories();
  if (!loaded || hasTxns) return null;
  const hasCategories = (categories ?? []).length > 0;
  return (
    <div style={{ textAlign: 'center', marginTop: 28 }}>
      {hasCategories ? (
        <button className="btn btn-secondary" onClick={openTxnModal}>
          Add the first transaction
        </button>
      ) : (
        <p className="text-muted" style={{ fontSize: 13 }}>
          Start by creating a few <Link to="/categories">categories</Link> — every transaction
          needs one.
        </p>
      )}
    </div>
  );
}
