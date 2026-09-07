import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  useActiveProfile,
  useCategories,
  useDeleteTransaction,
  useTransactions,
  useTransactionSummary,
} from '../api/hooks';
import type { TransactionQuery, TransactionResponse, TxnType } from '../api/types';
import { Card, KpiTile } from '../components/Card';
import { CategoryDot } from '../components/CategoryDot';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PencilIcon, TrashIcon } from '../components/icons';
import { MerchantBackfill } from '../components/MerchantBackfill';
import { TxnModal, useTxnModal } from '../components/TxnModal';
import { categoryOptions, categoryPath, effectiveColor, flattenTree } from '../lib/categoryColor';
import { formatAmount, formatShortDate, formatSigned, lastMonths } from '../lib/money';

type TypeFilter = 'ALL' | TxnType;

export function Transactions() {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [rowError, setRowError] = useState('');
  const { openTxnModal } = useTxnModal();
  const deleteTxn = useDeleteTransaction();
  // The transaction awaiting delete confirmation, or null when no dialog is open.
  const [confirmTxn, setConfirmTxn] = useState<TransactionResponse | null>(null);
  // The transaction open in the edit modal, or null when it's closed.
  const [editingTxn, setEditingTxn] = useState<TransactionResponse | null>(null);

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
  // One filter object for both queries: the table pages through it, the tiles
  // aggregate over all of it. They can never describe different rows.
  const filters: TransactionQuery = {
    from: monthOption?.from,
    to: monthOption?.to,
    type: typeFilter === 'ALL' ? undefined : typeFilter,
    categoryId: catFilter === 'all' ? undefined : Number(catFilter),
    includeDescendants: catFilter === 'all' ? undefined : true,
  };
  const txns = useTransactions({ ...filters, page });
  // The money tiles come from the server-side aggregate, which covers every
  // matching row — summing a page would undercount past the page size.
  const summary = useTransactionSummary(filters);

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

  // Tiles read the aggregate, not the visible page — the client-side search box
  // does not affect them. Currencies are never summed together, so the tiles show
  // the profile's own currency and the rest are disclosed as excluded.
  const summaryRows = summary.data ?? [];
  const totals = summaryRows.find((row) => row.currency === currency);
  const expenses = parseFloat(totals?.expense ?? '0');
  const income = parseFloat(totals?.income ?? '0');
  const net = parseFloat(totals?.net ?? '0');
  const foreignCount = summaryRows
    .filter((row) => row.currency !== currency)
    .reduce((total, row) => total + row.count, 0);

  const scopeParts: string[] = [monthOption ? monthOption.label : 'all time'];
  if (catFilter !== 'all') {
    const cat = byId.get(Number(catFilter));
    if (cat) scopeParts.unshift(cat.name);
  }
  // The type filter belongs in the caption too: without it an "Income 0,00 zł"
  // tile reads as "this profile has no income" rather than "income is filtered out".
  if (typeFilter !== 'ALL') scopeParts.push(`${typeFilter.toLowerCase()} only`);
  const scope = scopeParts.join(' · ');
  // Skipped currencies are disclosed on every tile, Net included.
  const foreignNote =
    foreignCount > 0
      ? ` · ${foreignCount} foreign-currency txn${foreignCount > 1 ? 's' : ''} excluded`
      : '';
  const tileSub = scope + foreignNote;
  const netSub = `${scope} · income minus expenses${foreignNote}`;

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
              <th>Merchant</th>
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
                <td className="text-muted">{t.merchant || '—'}</td>
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
                <td style={{ textAlign: 'right', width: 62 }}>
                  <button
                    className="btn btn-icon btn-ghost"
                    style={{ width: 28, height: 28 }}
                    onClick={() => setEditingTxn(t)}
                    aria-label={`Edit transaction ${t.description ?? t.id}`}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    className="btn btn-icon btn-ghost"
                    style={{ width: 28, height: 28 }}
                    disabled={deleteTxn.isPending && deleteTxn.variables === t.id}
                    onClick={() => setConfirmTxn(t)}
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
              ? `${rows.length} match${rows.length === 1 ? '' : 'es'} on this page · page ${
                  page + 1
                } of ${Math.max(1, totalPages)}`
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
      {confirmTxn && (
        <ConfirmDialog
          title={`Delete the transaction "${
            confirmTxn.description?.trim() ||
            categoryPath(byId, confirmTxn.category.id).join(' › ') ||
            confirmTxn.category.name
          } — ${formatAmount(confirmTxn.amount, confirmTxn.currency)}"?`}
          body="This can't be undone."
          confirmLabel="Delete"
          onClose={() => setConfirmTxn(null)}
          onConfirm={() => {
            const id = confirmTxn.id;
            setRowError('');
            setConfirmTxn(null);
            deleteTxn.mutate(id, {
              onError: (err) =>
                setRowError(
                  err instanceof ApiError ? err.detail : 'Could not delete the transaction.',
                ),
            });
          }}
        />
      )}
      {editingTxn && <TxnModal initial={editingTxn} onClose={() => setEditingTxn(null)} />}
    </main>
  );
}
