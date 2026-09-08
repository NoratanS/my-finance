import { useState } from 'react';
import { ApiError } from '../api/client';
import {
  useActiveProfile,
  useBudgets,
  useBudgetStatuses,
  useCategories,
  useDeleteBudget,
} from '../api/hooks';
import type { BudgetResponse } from '../api/types';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PencilIcon, PlusIcon, TrashIcon } from '../components/icons';
import { ProgressBar } from '../components/ProgressBar';
import { effectiveColor, flattenTree } from '../lib/categoryColor';
import { formatAmount, formatShortDate, todayIso } from '../lib/money';
import { BudgetForm } from './BudgetForm';

const OVER_COLOR = '#eeaabc';

type PeriodMode = 'active' | 'past' | 'upcoming';

const MODE_LABEL: Record<PeriodMode, string> = {
  active: 'active today',
  past: 'from the past',
  upcoming: 'upcoming',
};

const OTHER_MODES: Record<PeriodMode, string> = {
  active: 'Try Past or Upcoming.',
  past: 'Try Active or Upcoming.',
  upcoming: 'Try Active or Past.',
};

export function Budgets() {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  // J9: fetch every budget (no activeOn filter) so past/ended periods stay
  // reachable, then split by period client-side — the API has no
  // "before"/"after" query param, only the point-in-time `activeOn`.
  const budgets = useBudgets();
  const deleteBudget = useDeleteBudget();
  const [mode, setMode] = useState<PeriodMode>('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetResponse | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BudgetResponse | null>(null);
  const [rowError, setRowError] = useState('');

  const allBudgets = budgets.data ?? [];
  const today = todayIso();
  const filtered = allBudgets.filter((b) => {
    if (mode === 'active') return b.periodStart <= today && b.periodEnd >= today;
    if (mode === 'past') return b.periodEnd < today;
    return b.periodStart > today;
  });
  const statuses = useBudgetStatuses(filtered);

  if (!profile) return null;
  const byId = flattenTree(categories ?? []);

  const closeForm = () => {
    setFormOpen(false);
    setEditingBudget(null);
  };

  return (
    <main>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          margin: '26px 0 18px',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Budgets</h2>
          <span className="text-muted" style={{ fontSize: 13 }}>
            {MODE_LABEL[mode]} · subtree spend, one currency per budget
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="seg">
            {(['active', 'past', 'upcoming'] as const).map((m) => (
              <button
                key={m}
                className={`seg-btn${mode === m ? ' active' : ''}`}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </span>
          <button
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => setFormOpen(true)}
          >
            <PlusIcon size={13} /> New budget
          </button>
        </div>
      </div>
      {filtered.length > 0 ? (
        <div className="card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
          {filtered.map((budget, i) => {
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      className="btn btn-icon btn-secondary"
                      style={{ width: 26, height: 26 }}
                      onClick={() => setEditingBudget(budget)}
                      title="Edit"
                      aria-label={`Edit ${budget.category.name} budget`}
                    >
                      <PencilIcon size={12} />
                    </button>
                    <button
                      className="btn btn-icon btn-secondary"
                      style={{ width: 26, height: 26 }}
                      onClick={() => setPendingDelete(budget)}
                      title="Delete"
                      aria-label={`Delete ${budget.category.name} budget`}
                    >
                      <TrashIcon size={12} />
                    </button>
                    {over ? (
                      <span className="tag tag-outline">over budget</span>
                    ) : (
                      <span className="tag tag-accent">
                        {status ? `${Math.round(percent)}% used` : '…'}
                      </span>
                    )}
                  </div>
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
          {allBudgets.length === 0 ? (
            <>
              <p className="text-muted" style={{ margin: '0 0 16px' }}>
                No budgets yet for {profile.name}. Budgets set a spending limit for a category
                over a date range.
              </p>
              <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
                Create your first budget
              </button>
            </>
          ) : (
            <p className="text-muted" style={{ margin: 0 }}>
              No budgets {MODE_LABEL[mode]} for {profile.name} — {allBudgets.length} budget
              {allBudgets.length === 1 ? '' : 's'} total. {OTHER_MODES[mode]}
            </p>
          )}
        </Card>
      )}
      {rowError && (
        <div className="error-box" style={{ marginTop: 16 }}>
          {rowError}
        </div>
      )}
      {(formOpen || editingBudget) && (
        <BudgetForm budget={editingBudget ?? undefined} onClose={closeForm} />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={`Delete the ${pendingDelete.category.name} budget for ${formatShortDate(
            pendingDelete.periodStart,
          )} – ${formatShortDate(pendingDelete.periodEnd)}?`}
          body="This can't be undone."
          confirmLabel="Delete budget"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            setRowError('');
            deleteBudget.mutate(pendingDelete.id, {
              onError: (err) =>
                setRowError(
                  err instanceof ApiError
                    ? err.detail
                    : 'Something went wrong — is the backend running?',
                ),
            });
            setPendingDelete(null);
          }}
        />
      )}
    </main>
  );
}
