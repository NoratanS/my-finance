import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { useActiveProfile, useCategories, useCreateTransaction, useUpdateTransaction } from '../api/hooks';
import type { TransactionResponse, TxnType } from '../api/types';
import { categoryOptions } from '../lib/categoryColor';
import { todayIso } from '../lib/money';
import { Corners } from './Card';

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

  const [amount, setAmount] = useState(
    // Trim the API's fixed-scale trailing zeros ("10.0000") for editing.
    initial ? initial.amount.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : '',
  );
  const [date, setDate] = useState(initial?.occurredOn ?? today);
  const [type, setType] = useState<TxnType>(initial?.type ?? 'EXPENSE');
  const [categoryId, setCategoryId] = useState(initial ? String(initial.category.id) : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [merchant, setMerchant] = useState(initial?.merchant ?? '');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Dialog behavior: focus lands on the amount input, Escape closes.
  const amountRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    amountRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Editing keeps the transaction's own currency (never silently converts it
  // to the profile default); creating always uses the profile default.
  const currency = initial?.currency ?? profile?.defaultCurrency ?? 'PLN';
  // Fall back to the first option so the visible default and the saved value agree.
  const effectiveCategoryId = categoryId || (options[0] ? String(options[0].id) : '');
  const isPending = initial ? updateTxn.isPending : createTxn.isPending;

  const save = () => {
    setError('');
    setFieldErrors({});
    if (!effectiveCategoryId) {
      setError('Create a category first — every transaction needs one.');
      return;
    }
    const body = {
      categoryId: Number(effectiveCategoryId),
      amount: amount.trim().replace(',', '.'),
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
        if (err instanceof ApiError) {
          if (err.errors && err.errors.length > 0) {
            const byField: Record<string, string> = {};
            for (const fe of err.errors) {
              // occurredOnNotInFuture is the cross-field name for the date rule.
              const key = fe.field === 'occurredOnNotInFuture' ? 'occurredOn' : fe.field;
              byField[key] = fe.message;
            }
            setFieldErrors(byField);
          } else {
            setError(err.detail);
          }
        } else {
          setError('Something went wrong — is the backend running?');
        }
      },
    };
    if (initial) {
      updateTxn.mutate({ id: initial.id, body }, callbacks);
    } else {
      createTxn.mutate(body, callbacks);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose} style={{ zIndex: 100 }}>
      <div
        className="dialog blueprint"
        role="dialog"
        aria-modal="true"
        aria-labelledby="txn-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(480px, 100%)' }}
      >
        <Corners />
        <div className="dialog-title" id="txn-dialog-title">
          {initial ? 'Edit transaction' : 'Add transaction'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label htmlFor="txn-amount">Amount ({currency})</label>
              <input
                id="txn-amount"
                ref={amountRef}
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
          <div className="field">
            <label>Type</label>
            <span className="seg">
              {(['EXPENSE', 'INCOME'] as const).map((t) => (
                <button
                  key={t}
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
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={isPending}>
            {initial ? 'Save changes' : 'Save transaction'}
          </button>
        </div>
      </div>
    </div>
  );
}
