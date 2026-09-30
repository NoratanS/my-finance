import { useState } from 'react';
import {
  useActiveProfile,
  useCategories,
  useCreateSubscription,
  useUpdateSubscription,
} from '../api/hooks';
import { problemMessages } from '../api/problemMessages';
import type { BillingPeriod, SubscriptionResponse } from '../api/types';
import { Card } from '../components/Card';
import { categoryOptions } from '../lib/categoryColor';
import { currencyOptions, editableAmount, parseAmount, todayIso } from '../lib/money';

const CADENCES: BillingPeriod[] = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];

interface SubscriptionFormProps {
  /** Present = editing this subscription; null = the "Add subscription" form. */
  editing: SubscriptionResponse | null;
  /** An edit ended — saved or cancelled — so the screen can go back to the add form. */
  onEditEnd: () => void;
}

/**
 * Inline "Add subscription" / "Edit subscription" form — not a modal. Its state
 * starts from `editing`; the screen renders it keyed by the edited subscription,
 * so editing another one (or going back to adding) starts a fresh form.
 */
export function SubscriptionForm({ editing, onEditEnd }: SubscriptionFormProps) {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const createSub = useCreateSubscription();
  const updateSub = useUpdateSubscription();

  const options = categoryOptions(categories ?? []);
  const defaultCurrency = profile?.defaultCurrency ?? 'PLN';

  const [name, setName] = useState(editing?.name ?? '');
  const [price, setPrice] = useState(editing ? editableAmount(editing.amount) : '');
  const [next, setNext] = useState(editing?.nextBillingOn ?? todayIso());
  const [categoryId, setCategoryId] = useState(editing ? String(editing.category.id) : '');
  const [cadence, setCadence] = useState<BillingPeriod>(editing?.billingPeriod ?? 'MONTHLY');
  // J11: defaults to the profile's currency on create, but can be changed —
  // editing keeps the subscription's own currency instead (no selector shown).
  const [currency, setCurrency] = useState(defaultCurrency);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Fall back to the first option so the visible default and the saved value agree.
  const effectiveCategoryId = categoryId || (options[0] ? String(options[0].id) : '');
  const pending = createSub.isPending || updateSub.isPending;

  /** After an add: back to the add-form defaults, in place, so focus stays here. */
  const reset = () => {
    setName('');
    setPrice('');
    setNext(todayIso());
    setCategoryId('');
    setCadence('MONTHLY');
    setCurrency(defaultCurrency);
    setNotes('');
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return; // Enter bypasses the submit button's disabled state.
    setError('');
    setFieldErrors({});
    if (!effectiveCategoryId) {
      setError('Create a category first — every subscription needs one.');
      return;
    }
    const parsed = parseAmount(price);
    if ('message' in parsed) {
      setFieldErrors({ amount: parsed.message });
      return;
    }
    const body = {
      name: name.trim(),
      categoryId: Number(effectiveCategoryId),
      amount: parsed.amount,
      currency: editing ? editing.currency : currency,
      billingPeriod: cadence,
      nextBillingOn: next,
      notes: notes.trim() === '' ? null : notes.trim(),
    };
    const onError = (err: unknown) => {
      const failure = problemMessages(err, {
        fields: ['name', 'amount', 'nextBillingOn', 'notes'],
      });
      setFieldErrors(failure.fields);
      setError(failure.banner);
    };
    if (editing) {
      updateSub.mutate(
        { id: editing.id, body: { ...body, status: editing.status } },
        { onSuccess: onEditEnd, onError },
      );
    } else {
      createSub.mutate(body, { onSuccess: reset, onError });
    }
  };

  const fieldError = (field: string) =>
    fieldErrors[field] && (
      <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
        {fieldErrors[field]}
      </div>
    );

  return (
    <Card style={{ padding: '18px 20px' }}>
      <h4 style={{ margin: '0 0 12px' }}>{editing ? 'Edit subscription' : 'Add subscription'}</h4>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field">
          <label htmlFor="sub-name">Service</label>
          <input
            id="sub-name"
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
              setFieldErrors({ ...fieldErrors, name: '' });
            }}
            placeholder="e.g. Spotify"
            aria-label="Service name"
          />
          {fieldError('name')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="sub-price">Price ({editing ? editing.currency : currency})</label>
            <input
              id="sub-price"
              className="input"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setError('');
                setFieldErrors({ ...fieldErrors, amount: '' });
              }}
              placeholder="0.00"
              inputMode="decimal"
              aria-label="Price"
            />
            {fieldError('amount')}
          </div>
          <div className="field">
            <label htmlFor="sub-next">Next charge</label>
            <input
              id="sub-next"
              className="input"
              type="date"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-label="Next charge date"
            />
            {fieldError('nextBillingOn')}
          </div>
        </div>
        {!editing && (
          <div className="field">
            <label htmlFor="sub-currency">Currency</label>
            <select
              id="sub-currency"
              className="input"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-label="Currency"
            >
              {currencyOptions(defaultCurrency).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="sub-category">Category</label>
          <select
            id="sub-category"
            className="input"
            value={effectiveCategoryId}
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
                type="button"
                className={`seg-btn${cadence === c ? ' active' : ''}`}
                aria-pressed={cadence === c}
                onClick={() => setCadence(c)}
              >
                {c.toLowerCase()}
              </button>
            ))}
          </span>
        </div>
        <div className="field">
          <label htmlFor="sub-notes">Notes</label>
          <textarea
            id="sub-notes"
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — e.g. shared with roommates"
            aria-label="Notes"
          />
          {fieldError('notes')}
        </div>
        {error && <div className="error-box">{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {editing ? 'Save changes' : 'Add'}
          </button>
          {editing && (
            <button type="button" className="btn btn-secondary" onClick={onEditEnd}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}
