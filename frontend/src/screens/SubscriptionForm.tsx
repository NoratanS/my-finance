import { Card } from '../components/Card';
import type { CategoryOption } from '../lib/categoryColor';
import { currencyOptions } from '../lib/money';
import type { BillingPeriod, SubscriptionResponse } from '../api/types';

const CADENCES: BillingPeriod[] = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];

interface SubscriptionFormProps {
  /** Present = editing this subscription; absent = the "Add subscription" form. */
  editing: SubscriptionResponse | null;
  name: string;
  setName: (value: string) => void;
  price: string;
  setPrice: (value: string) => void;
  next: string;
  setNext: (value: string) => void;
  categoryId: string;
  setCategoryId: (value: string) => void;
  cadence: BillingPeriod;
  setCadence: (value: BillingPeriod) => void;
  // J11: defaults to the profile's currency on create, but can be changed —
  // editing keeps the subscription's own currency instead (set via startEdit,
  // never through this selector).
  subCurrency: string;
  setSubCurrency: (value: string) => void;
  notes: string;
  setNotes: (value: string) => void;
  error: string;
  setError: (value: string) => void;
  options: CategoryOption[];
  defaultCurrency: string;
  save: () => void;
  resetForm: () => void;
  saving: boolean;
}

/** Inline "Add subscription" / "Edit subscription" form — not a modal. */
export function SubscriptionForm({
  editing,
  name,
  setName,
  price,
  setPrice,
  next,
  setNext,
  categoryId,
  setCategoryId,
  cadence,
  setCadence,
  subCurrency,
  setSubCurrency,
  notes,
  setNotes,
  error,
  setError,
  options,
  defaultCurrency,
  save,
  resetForm,
  saving,
}: SubscriptionFormProps) {
  return (
    <Card style={{ padding: '18px 20px' }}>
      <h4 style={{ margin: '0 0 12px' }}>{editing ? 'Edit subscription' : 'Add subscription'}</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field">
          <label htmlFor="sub-name">Service</label>
          <input
            id="sub-name"
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
            <label htmlFor="sub-price">Price ({editing ? editing.currency : subCurrency})</label>
            <input
              id="sub-price"
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
            <label htmlFor="sub-next">Next charge</label>
            <input
              id="sub-next"
              className="input"
              type="date"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-label="Next charge date"
            />
          </div>
        </div>
        {!editing && (
          <div className="field">
            <label htmlFor="sub-currency">Currency</label>
            <select
              id="sub-currency"
              className="input"
              value={subCurrency}
              onChange={(e) => setSubCurrency(e.target.value)}
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
        </div>
        {error && <div className="error-box">{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
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
  );
}
