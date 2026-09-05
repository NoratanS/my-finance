import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  useActiveProfile,
  useCategories,
  useDeleteTransaction,
  useTransactions,
} from '../api/hooks';
import type { TransactionQuery, TxnType } from '../api/types';
import { Card, KpiTile } from '../components/Card';
import { CategoryDot } from '../components/CategoryDot';
import { TrashIcon } from '../components/icons';
import { MerchantBackfill } from '../components/MerchantBackfill';
import { useTxnModal } from '../components/TxnModal';
import { categoryOptions, categoryPath, effectiveColor, flattenTree } from '../lib/categoryColor';
import {
  formatAmount,
  formatShortDate,
  formatSigned,
  lastMonths,
  sumAmounts,
} from '../lib/money';

type TypeFilter = 'ALL' | TxnType;

export function Transactions() {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [rowError, setRowError] = useState('');
  const { openTxnModal } = useTxnModal();
  const deleteTxn = useDeleteTransaction();

  const months = useMemo(() => lastMonths(12), []);

  // Filters live in the URL so dashboard links ("view this category") work.
  const catFilter = searchParams.get('cat') ?? 'all';
  const typeFilter = (searchParams.get('type') ?? 'ALL') as TypeFilter;
  const period = searchParams.get('period') ?? months[0].value;
  // Clamp the URL-borne page: anything non-integer or negative falls back to 0.
  const rawPage = Number(searchParams.get('page') ?? '0');
  const page = Number.isInteger(rawPage) && rawPage >= 0 ? rawPage : 0;

  const setParam = (key: string, value: string | null, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    if (resetPage) next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const monthOption = months.find((m) => m.value === period);
  const query: TransactionQuery = {
    from: monthOption?.from,
    to: monthOption?.to,
    type: typeFilter === 'ALL' ? undefined : typeFilter,
    categoryId: catFilter === 'all' ? undefined : Number(catFilter),
    includeDescendants: catFilter === 'all' ? undefined : true,
    page,
  };
  const txns = useTransactions(query);
  // The money tiles sum a SEPARATE size-200 query over the same filters (like the
  // dashboard) — summing only the visible page would silently undercount.
  const summary = useTransactions({ ...query, page: undefined, size: 200 });

  if (!profile) return null;
  const currency = profile.defaultCurrency;
  const byId = flattenTree(categories ?? []);
  const options = categoryOptions(categories ?? []);

  const content = txns.data?.content ?? [];
  // Search stays client-side within the loaded page — the API has no search.
  const q = search.trim().toLowerCase();
  const rows = q
    ? content.filter(
        (t) =>
          (t.description ?? '').toLowerCase().includes(q) ||
          categoryPath(byId, t.category.id).join(' ').toLowerCase().includes(q),
      )
    : content;

  // Tiles come from the summary query (all filtered rows up to 200), not the
  // visible page — the client-side search box does not affect them.
  const summaryContent = summary.data?.content ?? [];
  const summaryTotal = summary.data?.totalElements ?? 0;
  const summaryTruncated = summaryTotal > 200;
  const inCurrency = summaryContent.filter((t) => t.currency === currency);
  const foreignCount = summaryContent.length - inCurrency.length;
  const expenses = sumAmounts(inCurrency.filter((t) => t.type === 'EXPENSE').map((t) => t.amount));
  const income = sumAmounts(inCurrency.filter((t) => t.type === 'INCOME').map((t) => t.amount));
  const net = income - expenses;

  const scopeParts: string[] = [monthOption ? monthOption.label : 'all time'];
  if (catFilter !== 'all') {
    const cat = byId.get(Number(catFilter));
    if (cat) scopeParts.unshift(cat.name);
  }
  const scope = scopeParts.join(' · ');
  // Honesty captions: truncation ("first 200 of N summed") and skipped currencies.
  const tileSub = summaryTruncated ? `${scope} · first 200 of ${summaryTotal} summed` : scope;
  const netSub =
    foreignCount > 0
      ? `income minus expenses · ${foreignCount} foreign-currency txn${foreignCount > 1 ? 's' : ''} excluded`
      : 'income minus expenses';

  const totalPages = txns.data?.totalPages ?? 1;
  const totalElements = txns.data?.totalElements ?? 0;

  return (
    <main>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '26px 0 18px',
          gap: 16,
        }}
      >
        <h2 style={{ margin: 0 }}>Transactions</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ width: 190, minHeight: 32, padding: '4px 10px', fontSize: 13 }}
            placeholder="Search e.g. Biedronka"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search transactions"
          />
          <span className="seg">
            {(['ALL', 'EXPENSE', 'INCOME'] as const).map((f) => (
              <button
                key={f}
                className={`seg-btn${typeFilter === f ? ' active' : ''}`}
                aria-pressed={typeFilter === f}
                onClick={() => setParam('type', f === 'ALL' ? null : f)}
              >
                {f.toLowerCase()}
              </button>
            ))}
          </span>
          <select
            className="input"
            style={{ width: 'auto', minHeight: 32, padding: '4px 8px', fontSize: 13 }}
            value={catFilter}
            onChange={(e) => setParam('cat', e.target.value === 'all' ? null : e.target.value)}
            aria-label="Category filter"
          >
            <option value="all">All categories</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="input"
            style={{ width: 'auto', minHeight: 32, padding: '4px 8px', fontSize: 13 }}
            value={monthOption ? period : 'all'}
            onChange={(e) => setParam('period', e.target.value)}
            aria-label="Time period"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
            <option value="all">All time</option>
          </select>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 24,
          marginBottom: 24,
        }}
      >
        <KpiTile compact label="Expenses" value={formatAmount(expenses, currency)} sub={tileSub} />
        <KpiTile compact label="Income" value={formatAmount(income, currency)} sub={tileSub} />
        <KpiTile
          compact
          label="Net"
          value={(net >= 0 ? '+' : '−') + formatAmount(Math.abs(net), currency)}
          sub={netSub}
        />
      </div>
      <MerchantBackfill />
      <Card style={{ padding: '6px 18px 14px' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                  {formatShortDate(t.occurredOn)}
                </td>
                <td>
                  <a
                    href="#"
                    className="row-link"
                    onClick={(e) => {
                      e.preventDefault();
                      setParam('cat', String(t.category.id));
                    }}
                  >
                    <CategoryDot color={effectiveColor(byId, t.category.id)} />
                    {categoryPath(byId, t.category.id).join(' › ') || t.category.name}
                  </a>
                </td>
                <td className="text-muted">{t.description || '—'}</td>
                <td>
                  <span className={t.type === 'INCOME' ? 'tag tag-accent' : 'tag tag-neutral'}>
                    {t.type.toLowerCase()}
                  </span>
                  {t.subscriptionId !== null && (
                    <span className="tag tag-neutral" style={{ marginLeft: 6, fontSize: 10 }}>
                      sub
                    </span>
                  )}
                </td>
                <td className="tnum" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span className={t.type === 'INCOME' ? 'amt-income' : undefined}>
                    {formatSigned(t.amount, t.currency, t.type)}
                  </span>
                </td>
                <td style={{ textAlign: 'right', width: 34 }}>
                  <button
                    className="btn btn-icon btn-ghost"
                    style={{ width: 28, height: 28 }}
                    disabled={deleteTxn.isPending && deleteTxn.variables === t.id}
                    onClick={() => {
                      setRowError('');
                      deleteTxn.mutate(t.id, {
                        onError: (err) =>
                          setRowError(
                            err instanceof ApiError
                              ? err.detail
                              : 'Could not delete the transaction.',
                          ),
                      });
                    }}
                    aria-label="Delete transaction"
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rowError && (
          <div className="error-box" style={{ marginTop: 10 }}>
            {rowError}
          </div>
        )}
        {rows.length === 0 && (
          <div style={{ textAlign: 'center', padding: '36px 0 24px' }}>
            <p className="text-muted" style={{ fontSize: 14, margin: '0 0 12px' }}>
              No transactions match — or this profile is empty.
            </p>
            <button className="btn btn-secondary" onClick={openTxnModal}>
              Add the first one
            </button>
          </div>
        )}
        <div
          className="text-muted"
          style={{
            fontSize: 12,
            marginTop: 10,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {q
              ? `${rows.length} of ${totalElements} transactions match`
              : `${totalElements} transactions · page ${page + 1} of ${Math.max(1, totalPages)}`}
            {totalPages > 1 && (
              <>
                <button
                  className="page-btn"
                  disabled={page <= 0}
                  onClick={() => setParam('page', String(page - 1), false)}
                >
                  ‹ prev
                </button>
                <button
                  className="page-btn"
                  disabled={page >= totalPages - 1}
                  onClick={() => setParam('page', String(page + 1), false)}
                >
                  next ›
                </button>
              </>
            )}
          </span>
          <span>sorted occurredOn desc</span>
        </div>
      </Card>
    </main>
  );
}
