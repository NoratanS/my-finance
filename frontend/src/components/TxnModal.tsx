import { createContext, useContext, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { useActiveProfile, useCategories, useCreateTransaction } from '../api/hooks';
import type { TxnType } from '../api/types';
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

function TxnModal({ onClose }: { onClose: () => void }) {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const createTxn = useCreateTransaction();

  const options = categoryOptions(categories ?? []);
  const today = todayIso();

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [type, setType] = useState<TxnType>('EXPENSE');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const currency = profile?.defaultCurrency ?? 'PLN';
  // Fall back to the first option so the visible default and the saved value agree.
  const effectiveCategoryId = categoryId || (options[0] ? String(options[0].id) : '');

  const save = () => {
    setError('');
    setFieldErrors({});
    if (!effectiveCategoryId) {
      setError('Create a category first — every transaction needs one.');
      return;
    }
    createTxn.mutate(
      {
        categoryId: Number(effectiveCategoryId),
        amount: amount.trim().replace(',', '.'),
        currency,
        type,
        occurredOn: date,
        description: description.trim() || null,
      },
      {
        onSuccess: onClose,
        onError: (err) => {
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
      },
    );
  };

  return (
    <div className="dialog-backdrop" onClick={onClose} style={{ zIndex: 100 }}>
      <div
        className="dialog blueprint"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(480px, 100%)' }}
      >
        <Corners />
        <div className="dialog-title">Add transaction</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label>Amount ({currency})</label>
              <input
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
              <label>Date</label>
              <input
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
                  onClick={() => setType(t)}
                >
                  {t.toLowerCase()}
                </button>
              ))}
            </span>
          </div>
          <div className="field">
            <label>Category</label>
            <select
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
            <label>Description (optional)</label>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Biedronka"
              aria-label="Description"
            />
          </div>
          {error && <div className="error-box">{error}</div>}
        </div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={createTxn.isPending}>
            Save transaction
          </button>
        </div>
      </div>
    </div>
  );
}
