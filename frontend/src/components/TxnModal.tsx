import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  useActiveProfile,
  useCategories,
  useCreateTransaction,
  useUpdateTransaction,
} from '../api/hooks';
import { problemMessages } from '../api/problemMessages';
import type { TransactionResponse, TxnType } from '../api/types';
import { categoryOptions } from '../lib/categoryColor';
import { currencyOptions, editableAmount, parseAmount, todayIso } from '../lib/money';
import { Dialog } from './Dialog';

// — Context so any screen (nav button, empty states) can open the dialog —

interface TxnModalContextValue {
  openTxnModal: () => void;
}

const TxnModalContext = createContext<TxnModalContextValue>({ openTxnModal: () => {} });

export function useTxnModal() {
  return useContext(TxnModalContext);
}

export function TxnModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <TxnModalContext.Provider value={{ openTxnModal: () => setOpen(true) }}>
      {children}
      {open && <TxnModal onClose={() => setOpen(false)} />}
    </TxnModalContext.Provider>
  );
}

// — The dialog itself —

/** Also used directly (not via context) by Transactions.tsx for edit mode. */
export function TxnModal({
  initial,
  onClose,
}: {
  /** Present -> edit this transaction (PUT) instead of creating a new one (POST). */
  initial?: TransactionResponse;
  onClose: () => void;
}) {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const createTxn = useCreateTransaction();
  const updateTxn = useUpdateTransaction();

  const options = categoryOptions(categories ?? []);
  const today = todayIso();

  const [amount, setAmount] = useState(initial ? editableAmount(initial.amount) : '');
  const [date, setDate] = useState(initial?.occurredOn ?? today);
  const [type, setType] = useState<TxnType>(initial?.type ?? 'EXPENSE');
  const [categoryId, setCategoryId] = useState(initial ? String(initial.category.id) : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [merchant, setMerchant] = useState(initial?.merchant ?? '');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Editing keeps the transaction's own currency (never silently converts it);
  // creating defaults to the profile's, but J11 lets it be changed — the app
  // displays and warns about foreign-currency records everywhere else, so the
  // create form must be able to produce them.
  const [currency, setCurrency] = useState(initial?.currency ?? profile?.defaultCurrency ?? 'PLN');
  // Fall back to the first option so the visible default and the saved value agree.
  const effectiveCategoryId = categoryId || (options[0] ? String(options[0].id) : '');
  const isPending = initial ? updateTxn.isPending : createTxn.isPending;

  const save = () => {
    if (isPending) return; // Enter bypasses the Save button's disabled state.
    setError('');
    setFieldErrors({});
    if (!effectiveCategoryId) {
      setError('Create a category first — every transaction needs one.');
      return;
    }
    const parsed = parseAmount(amount);
    if ('message' in parsed) {
      setFieldErrors({ amount: parsed.message });
      return;
    }
    const body = {
      categoryId: Number(effectiveCategoryId),
      amount: parsed.amount,
      currency,
      type,
      occurredOn: date,
      description: description.trim() || null,
      // Blanking the field must send an explicit null, not omit the key —
      // otherwise a cleared merchant would silently keep its old value.
      merchant: merchant.trim() || null,
    };
    const callbacks = {
      onSuccess: onClose,
      onError: (err: unknown) => {
        const messages = problemMessages(err, { fields: ['amount', 'occurredOn', 'merchant'] });
        setFieldErrors(messages.fields);
        setError(messages.banner);
      },
    };
    if (initial) {
      updateTxn.mutate({ id: initial.id, body }, callbacks);
    } else {
      createTxn.mutate(body, callbacks);
    }
  };

  return (
    <Dialog title={initial ? 'Edit transaction' : 'Add transaction'} onClose={onClose} width={480}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label htmlFor="txn-amount">Amount ({currency})</label>
              <input
                id="txn-amount"
                className="input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                aria-label="Amount"
              />
              {fieldErrors.amount && (
                <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
                  {fieldErrors.amount}
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor="txn-date">Date</label>
              <input
                id="txn-date"
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={today}
                aria-label="Date"
              />
              {fieldErrors.occurredOn && (
                <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
                  {fieldErrors.occurredOn}
                </div>
              )}
            </div>
          </div>
          {!initial && (
            <div className="field">
              <label htmlFor="txn-currency">Currency</label>
              <select
                id="txn-currency"
                className="input"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                aria-label="Currency"
              >
                {currencyOptions(profile?.defaultCurrency ?? 'PLN').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Type</label>
            <span className="seg">
              {(['EXPENSE', 'INCOME'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`seg-btn${type === t ? ' active' : ''}`}
                  aria-pressed={type === t}
                  onClick={() => setType(t)}
                >
                  {t.toLowerCase()}
                </button>
              ))}
            </span>
          </div>
          <div className="field">
            <label htmlFor="txn-category">Category</label>
            <select
              id="txn-category"
              className="input"
              value={effectiveCategoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Category"
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="txn-description">Description (optional)</label>
            <input
              id="txn-description"
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Biedronka"
              aria-label="Description"
            />
          </div>
          <div className="field">
            <label htmlFor="txn-merchant">Merchant (optional)</label>
            <input
              id="txn-merchant"
              className="input"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="e.g. Lidl"
              aria-label="Merchant"
            />
            {fieldErrors.merchant && (
              <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
                {fieldErrors.merchant}
              </div>
            )}
          </div>
          {error && <div className="error-box">{error}</div>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {initial ? 'Save changes' : 'Save transaction'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
