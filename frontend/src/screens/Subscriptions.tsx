import { useState } from 'react';
import {
  useActiveProfile,
  useDeleteSubscription,
  useSubscriptionDashboard,
  useSubscriptions,
  useUpdateSubscription,
} from '../api/hooks';
import { problemMessages } from '../api/problemMessages';
import type { SubscriptionResponse } from '../api/types';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatAmount, formatDateWithYear, todayIso } from '../lib/money';
import { SubscriptionForm } from './SubscriptionForm';
import { SubscriptionRow } from './SubscriptionRow';

export function Subscriptions() {
  const profile = useActiveProfile();
  const [listMode, setListMode] = useState<'current' | 'cancelled'>('current');
  const subs = useSubscriptions(listMode === 'cancelled' ? 'CANCELLED' : undefined);
  const dashboard = useSubscriptionDashboard();

  const updateSub = useUpdateSubscription();
  const deleteSub = useDeleteSubscription();
  // The subscription and action awaiting confirmation, or null when no dialog is open.
  const [pendingAction, setPendingAction] = useState<{
    sub: SubscriptionResponse;
    kind: 'cancel' | 'delete';
  } | null>(null);

  // The subscription the form is editing, or null for the "Add subscription" form.
  const [editing, setEditing] = useState<SubscriptionResponse | null>(null);
  // Errors from the per-row actions (pause/resume/cancel/delete) — shown by the
  // table, not in the form, so they appear next to what the user clicked.
  const [rowError, setRowError] = useState('');

  if (!profile) return null;
  const currency = profile.defaultCurrency;
  const list = subs.data ?? [];
  const dash = dashboard.data;
  const overdueIds = new Set((dash?.overdue ?? []).map((o) => o.id));

  const onRowError = (err: unknown) => {
    setRowError(problemMessages(err).banner);
  };

  /** True while a mutation for THIS row is in flight — its buttons disable. */
  const rowBusy = (id: number) =>
    (updateSub.isPending && updateSub.variables?.id === id) ||
    (deleteSub.isPending && deleteSub.variables === id);

  /** Pause / resume / cancel = PUT with the same fields and a new status. */
  const setStatus = (sub: SubscriptionResponse, status: SubscriptionResponse['status']) => {
    const today = todayIso();
    setRowError('');
    updateSub.mutate(
      {
        id: sub.id,
        body: {
          name: sub.name,
          categoryId: sub.category.id,
          amount: sub.amount,
          currency: sub.currency,
          billingPeriod: sub.billingPeriod,
          // Resuming with a past date would post the missed charges — send a
          // fresh date instead, per the API's note.
          nextBillingOn:
            status === 'ACTIVE' && sub.nextBillingOn < today ? today : sub.nextBillingOn,
          notes: sub.notes,
          status,
        },
      },
      { onError: onRowError },
    );
  };

  const remove = (sub: SubscriptionResponse) => {
    setRowError('');
    deleteSub.mutate(sub.id, { onError: onRowError });
  };

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
        <h2 style={{ margin: 0 }}>Subscriptions</h2>
        <span className="seg">
          {(['current', 'cancelled'] as const).map((mode) => (
            <button
              key={mode}
              className={`seg-btn${listMode === mode ? ' active' : ''}`}
              aria-pressed={listMode === mode}
              onClick={() => setListMode(mode)}
            >
              {mode}
            </button>
          ))}
        </span>
      </div>
      <div
        className="card-grid"
        style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 24, alignItems: 'start' }}
      >
        <Card style={{ padding: '6px 18px 14px' }}>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Category</th>
                  <th>Cadence</th>
                  <th>Status</th>
                  <th>Next charge</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                  <th style={{ textAlign: 'right' }}>/ month</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((sub) => (
                  <SubscriptionRow
                    key={sub.id}
                    sub={sub}
                    busy={rowBusy(sub.id)}
                    overdue={overdueIds.has(sub.id)}
                    onEdit={setEditing}
                    onSetStatus={setStatus}
                    onRequestCancel={(sub) => setPendingAction({ sub, kind: 'cancel' })}
                    onRequestDelete={(sub) => setPendingAction({ sub, kind: 'delete' })}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {rowError && (
            <div className="error-box" style={{ marginTop: 10 }}>
              {rowError}
            </div>
          )}
          {list.length === 0 && (
            <p
              className="text-muted"
              style={{ fontSize: 13, padding: '20px 0', textAlign: 'center', margin: 0 }}
            >
              {listMode === 'cancelled'
                ? 'No cancelled subscriptions.'
                : 'No subscriptions tracked for this profile.'}
            </p>
          )}
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <SubscriptionForm
            key={editing?.id ?? 'new'}
            editing={editing}
            onEditEnd={() => setEditing(null)}
          />
          <Card style={{ padding: '18px 20px' }}>
            <div className="kicker">Monthly equivalent</div>
            {(dash?.monthlyCost.length ?? 0) > 0 ? (
              dash!.monthlyCost.map((cost) => (
                <div key={cost.currency} className="kpi-value">
                  {formatAmount(cost.amount, cost.currency)}
                </div>
              ))
            ) : (
              <div className="kpi-value">{formatAmount('0', currency)}</div>
            )}
            <div className="text-muted" style={{ fontSize: 12 }}>
              active only · server-normalized (weekly ×52⁄12, quarterly ÷3, yearly ÷12)
            </div>
            {dash && dash.chargedThisMonth.length > 0 && (
              <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                charged this month:{' '}
                {dash.chargedThisMonth
                  .map((cost) => formatAmount(cost.amount, cost.currency))
                  .join(' · ')}
              </div>
            )}
          </Card>
          <Card style={{ padding: '18px 20px' }}>
            <h4 style={{ margin: '0 0 8px' }}>Upcoming renewals</h4>
            {dash && (dash.upcoming.length > 0 || dash.overdue.length > 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dash.overdue.map((r) => (
                  <div
                    key={`o${r.id}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 13,
                      gap: 8,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {r.name}
                      <span className="tag tag-outline" style={{ fontSize: 10 }}>
                        overdue
                      </span>
                    </span>
                    <span className="text-muted tnum" style={{ whiteSpace: 'nowrap' }}>
                      {formatDateWithYear(r.nextBillingOn)} · {formatAmount(r.amount, r.currency)}
                    </span>
                  </div>
                ))}
                {dash.upcoming.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 13,
                      gap: 8,
                    }}
                  >
                    <span>
                      {r.name}
                      <span className="text-muted" style={{ marginLeft: 8, fontSize: 12 }}>
                        {r.daysUntil === 0 ? 'today' : `in ${r.daysUntil}d`}
                      </span>
                    </span>
                    <span className="text-muted tnum" style={{ whiteSpace: 'nowrap' }}>
                      {formatDateWithYear(r.nextBillingOn)} · {formatAmount(r.amount, r.currency)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                Nothing due in the next 30 days.
              </p>
            )}
          </Card>
        </div>
      </div>
      {pendingAction?.kind === 'cancel' && (
        <ConfirmDialog
          title={`Cancel "${pendingAction.sub.name}"?`}
          body="Billing stops and it moves to the cancelled list. It is not deleted — you can restore it from there at any time."
          confirmLabel="Cancel subscription"
          onClose={() => setPendingAction(null)}
          onConfirm={() => {
            setStatus(pendingAction.sub, 'CANCELLED');
            setPendingAction(null);
          }}
        />
      )}
      {pendingAction?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete "${pendingAction.sub.name}" permanently?`}
          body="This can't be undone."
          confirmLabel="Delete permanently"
          onClose={() => setPendingAction(null)}
          onConfirm={() => {
            remove(pendingAction.sub);
            setPendingAction(null);
          }}
        />
      )}
    </main>
  );
}
