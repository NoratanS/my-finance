import { useState } from 'react';
import { ApiError } from '../api/client';
import {
  useActiveProfile,
  useCategories,
  useCreateSubscription,
  useDeleteSubscription,
  useSubscriptionDashboard,
  useSubscriptions,
  useUpdateSubscription,
} from '../api/hooks';
import type { BillingPeriod, SubscriptionResponse } from '../api/types';
import { Card } from '../components/Card';
import { PauseIcon, PencilIcon, PlayIcon, TrashIcon, XIcon } from '../components/icons';
import { categoryOptions } from '../lib/categoryColor';
import { formatAmount, formatDateWithYear, todayIso } from '../lib/money';

const CADENCES: BillingPeriod[] = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];
const PER_LABEL: Record<BillingPeriod, string> = {
  WEEKLY: '/ wk',
  MONTHLY: '/ mo',
  QUARTERLY: '/ qtr',
  YEARLY: '/ yr',
};

export function Subscriptions() {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const [listMode, setListMode] = useState<'current' | 'cancelled'>('current');
  const subs = useSubscriptions(listMode === 'cancelled' ? 'CANCELLED' : undefined);
  const dashboard = useSubscriptionDashboard();

  const createSub = useCreateSubscription();
  const updateSub = useUpdateSubscription();
  const deleteSub = useDeleteSubscription();

  // Form state ("Add subscription" / "Edit subscription").
  const [editing, setEditing] = useState<SubscriptionResponse | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [next, setNext] = useState(todayIso());
  const [categoryId, setCategoryId] = useState('');
  const [cadence, setCadence] = useState<BillingPeriod>('MONTHLY');
  const [error, setError] = useState('');

  if (!profile) return null;
  const currency = profile.defaultCurrency;
  const options = categoryOptions(categories ?? []);
  const list = subs.data ?? [];
  const dash = dashboard.data;
  const overdueIds = new Set((dash?.overdue ?? []).map((o) => o.id));

  const resetForm = () => {
    setEditing(null);
    setName('');
    setPrice('');
    setNext(todayIso());
    setCadence('MONTHLY');
    setError('');
  };

  const startEdit = (sub: SubscriptionResponse) => {
    setEditing(sub);
    setName(sub.name);
    setPrice(sub.amount.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''));
    setNext(sub.nextBillingOn);
    setCategoryId(String(sub.category.id));
    setCadence(sub.billingPeriod);
    setError('');
  };

  const onError = (err: unknown) => {
    if (err instanceof ApiError) {
      setError(
        err.errors && err.errors.length > 0
          ? err.errors.map((fe) => fe.message).join(' · ')
          : err.detail,
      );
    } else {
      setError('Could not save the subscription.');
    }
  };

  const save = () => {
    setError('');
    const catId = categoryId || (options[0] ? String(options[0].id) : '');
    if (!catId) {
      setError('Create a category first — every subscription needs one.');
      return;
    }
    const body = {
      name: name.trim(),
      categoryId: Number(catId),
      amount: price.trim().replace(',', '.'),
      currency: editing ? editing.currency : currency,
      billingPeriod: cadence,
      nextBillingOn: next,
      notes: editing ? editing.notes : null,
    };
    if (editing) {
      updateSub.mutate(
        { id: editing.id, body: { ...body, status: editing.status } },
        { onSuccess: resetForm, onError },
      );
    } else {
      createSub.mutate(body, { onSuccess: resetForm, onError });
    }
  };

  /** Pause / resume / cancel = PUT with the same fields and a new status. */
  const setStatus = (sub: SubscriptionResponse, status: SubscriptionResponse['status']) => {
    const today = todayIso();
    updateSub.mutate({
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
    });
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
              onClick={() => setListMode(mode)}
            >
              {mode}
            </button>
          ))}
        </span>
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 24, alignItems: 'start' }}
      >
        <Card style={{ padding: '6px 18px 14px' }}>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((sub) => (
                <tr key={sub.id}>
                  <td>{sub.name}</td>
                  <td className="text-muted">{sub.category.name}</td>
                  <td>
                    <span className="tag tag-neutral">{sub.billingPeriod.toLowerCase()}</span>
                  </td>
                  <td>
                    {sub.status === 'ACTIVE' && <span className="tag tag-accent-2">active</span>}
                    {sub.status === 'PAUSED' && <span className="tag tag-neutral">paused</span>}
                    {sub.status === 'CANCELLED' && (
                      <span className="tag tag-outline">cancelled</span>
                    )}
                  </td>
                  <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                    {formatDateWithYear(sub.nextBillingOn)}
                    {overdueIds.has(sub.id) && (
                      <span className="tag tag-outline" style={{ marginLeft: 8, fontSize: 10 }}>
                        overdue
                      </span>
                    )}
                  </td>
                  <td className="tnum" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {formatAmount(sub.amount, sub.currency)} {PER_LABEL[sub.billingPeriod]}
                  </td>
                  <td className="tnum" style={{ textAlign: 'right' }}>
                    {formatAmount(sub.monthlyAmount, sub.currency)}
                  </td>
                  <td style={{ textAlign: 'right', width: 106 }}>
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      {sub.status !== 'CANCELLED' && (
                        <>
                          <button
                            className="btn btn-icon btn-secondary"
                            style={{ width: 28, height: 28 }}
                            onClick={() => startEdit(sub)}
                            title="Edit"
                            aria-label={`Edit ${sub.name}`}
                          >
                            <PencilIcon />
                          </button>
                          {sub.status === 'ACTIVE' ? (
                            <button
                              className="btn btn-icon btn-secondary"
                              style={{ width: 28, height: 28 }}
                              onClick={() => setStatus(sub, 'PAUSED')}
                              title="Pause"
                              aria-label={`Pause ${sub.name}`}
                            >
                              <PauseIcon />
                            </button>
                          ) : (
                            <button
                              className="btn btn-icon btn-secondary"
                              style={{ width: 28, height: 28 }}
                              onClick={() => setStatus(sub, 'ACTIVE')}
                              title="Resume"
                              aria-label={`Resume ${sub.name}`}
                            >
                              <PlayIcon />
                            </button>
                          )}
                          <button
                            className="btn btn-icon btn-secondary"
                            style={{ width: 28, height: 28 }}
                            onClick={() => setStatus(sub, 'CANCELLED')}
                            title="Cancel subscription"
                            aria-label={`Cancel ${sub.name}`}
                          >
                            <XIcon />
                          </button>
                        </>
                      )}
                      {sub.status === 'CANCELLED' && (
                        <button
                          className="btn btn-icon btn-secondary"
                          style={{ width: 28, height: 28 }}
                          onClick={() => deleteSub.mutate(sub.id)}
                          title="Delete permanently"
                          aria-label={`Delete ${sub.name}`}
                        >
                          <TrashIcon size={13} />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <Card style={{ padding: '18px 20px' }}>
            <h4 style={{ margin: '0 0 12px' }}>
              {editing ? 'Edit subscription' : 'Add subscription'}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>Service</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError('');
                  }}
                  placeholder="e.g. Spotify"
                  aria-label="Service name"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label>Price ({editing ? editing.currency : currency})</label>
                  <input
                    className="input"
                    value={price}
                    onChange={(e) => {
                      setPrice(e.target.value);
                      setError('');
                    }}
                    placeholder="0.00"
                    inputMode="decimal"
                    aria-label="Price"
                  />
                </div>
                <div className="field">
                  <label>Next charge</label>
                  <input
                    className="input"
                    type="date"
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    aria-label="Next charge date"
                  />
                </div>
              </div>
              <div className="field">
                <label>Category</label>
                <select
                  className="input"
                  value={categoryId || (options[0] ? String(options[0].id) : '')}
                  onChange={(e) => setCategoryId(e.target.value)}
                  aria-label="Subscription category"
                >
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Cadence</label>
                <span className="seg">
                  {CADENCES.map((c) => (
                    <button
                      key={c}
                      className={`seg-btn${cadence === c ? ' active' : ''}`}
                      onClick={() => setCadence(c)}
                    >
                      {c.toLowerCase()}
                    </button>
                  ))}
                </span>
              </div>
              {error && <div className="error-box">{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={save}
                  disabled={createSub.isPending || updateSub.isPending}
                >
                  {editing ? 'Save changes' : 'Add'}
                </button>
                {editing && (
                  <button className="btn btn-secondary" onClick={resetForm}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </Card>
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
    </main>
  );
}
