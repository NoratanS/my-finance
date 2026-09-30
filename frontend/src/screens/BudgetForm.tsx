import { useState } from 'react';
import { useActiveProfile, useCategories, useCreateBudget, useUpdateBudget } from '../api/hooks';
import { problemMessages } from '../api/problemMessages';
import type { BudgetResponse } from '../api/types';
import { Dialog } from '../components/Dialog';
import { categoryOptions } from '../lib/categoryColor';
import { currentMonth, editableAmount, parseAmount } from '../lib/money';

interface BudgetFormProps {
  /** Present = editing this budget; absent = creating a new one. */
  budget?: BudgetResponse;
  onClose: () => void;
}

/**
 * Create/edit dialog for a budget — categoryId, amountLimit, currency, period.
 * Same form idiom as TxnModal: plain state, the form's own checks first, server
 * field messages under each field.
 */
export function BudgetForm({ budget, onClose }: BudgetFormProps) {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();

  const options = categoryOptions(categories ?? []);
  const month = currentMonth();

  const [categoryId, setCategoryId] = useState(budget ? String(budget.category.id) : '');
  const [amountLimit, setAmountLimit] = useState(budget ? editableAmount(budget.amountLimit) : '');
  const [currency, setCurrency] = useState(budget?.currency ?? profile?.defaultCurrency ?? 'PLN');
  const [periodStart, setPeriodStart] = useState(budget?.periodStart ?? month.from);
  const [periodEnd, setPeriodEnd] = useState(budget?.periodEnd ?? month.to);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Fall back to the first option so the visible default and the saved value agree.
  const effectiveCategoryId = categoryId || (options[0] ? String(options[0].id) : '');
  const pending = createBudget.isPending || updateBudget.isPending;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return; // Enter bypasses the submit button's disabled state.
    setError('');
    setFieldErrors({});

    // Every check runs, and every message shows together.
    const messages: Record<string, string> = {};
    const parsed = parseAmount(amountLimit);
    if ('message' in parsed) messages.amountLimit = parsed.message;
    if (!/^[A-Z]{3}$/.test(currency)) messages.currency = 'Three-letter code, e.g. PLN';
    if (!periodStart) messages.periodStart = 'Pick a date';
    if (!periodEnd) messages.periodEnd = 'Pick a date';
    // ISO dates compare correctly as strings.
    if (periodStart && periodEnd && periodEnd < periodStart) {
      messages.periodEnd = 'End date must be on or after the start date';
    }
    const banner = effectiveCategoryId ? '' : 'Create a category first — every budget needs one.';
    if ('message' in parsed || banner || Object.keys(messages).length > 0) {
      setError(banner);
      setFieldErrors(messages);
      return;
    }

    const body = {
      categoryId: Number(effectiveCategoryId),
      amountLimit: parsed.amount,
      currency,
      periodStart,
      periodEnd,
    };
    const callbacks = {
      onSuccess: onClose,
      onError: (err: unknown) => {
        const failure = problemMessages(err, {
          fields: ['categoryId', 'amountLimit', 'currency', 'periodStart', 'periodEnd'],
        });
        setFieldErrors(failure.fields);
        setError(failure.banner);
      },
    };
    if (budget) {
      updateBudget.mutate({ id: budget.id, body }, callbacks);
    } else {
      createBudget.mutate(body, callbacks);
    }
  };

  const fieldError = (field: string) =>
    fieldErrors[field] && (
      <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
        {fieldErrors[field]}
      </div>
    );

  return (
    <Dialog title={budget ? 'Edit budget' : 'Add budget'} onClose={onClose} width={480}>
      <form onSubmit={save}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label htmlFor="budget-category">Category</label>
            <select
              id="budget-category"
              className="input"
              value={effectiveCategoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {fieldError('categoryId')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label htmlFor="budget-amount">Amount limit</label>
              <input
                id="budget-amount"
                className="input"
                inputMode="decimal"
                placeholder="0.00"
                value={amountLimit}
                onChange={(e) => setAmountLimit(e.target.value)}
              />
              {fieldError('amountLimit')}
            </div>
            <div className="field">
              <label htmlFor="budget-currency">Currency</label>
              <input
                id="budget-currency"
                className="input"
                placeholder="PLN"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              />
              {fieldError('currency')}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label htmlFor="budget-period-start">Period start</label>
              <input
                id="budget-period-start"
                className="input"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
              {fieldError('periodStart')}
            </div>
            <div className="field">
              <label htmlFor="budget-period-end">Period end</label>
              <input
                id="budget-period-end"
                className="input"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
              {fieldError('periodEnd')}
            </div>
          </div>
          {error && <div className="error-box">{error}</div>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {budget ? 'Save changes' : 'Add budget'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
