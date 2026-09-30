import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useActiveProfile, useCategories, useCreateBudget, useUpdateBudget } from '../api/hooks';
import { problemMessages } from '../api/problemMessages';
import type { BudgetResponse } from '../api/types';
import { Dialog } from '../components/Dialog';
import { categoryOptions } from '../lib/categoryColor';
import { currentMonth } from '../lib/money';
import { budgetSchema } from '../lib/schemas';

// The <select>/<input> DOM values RHF collects (categoryId still a string)
// vs. what the zod resolver coerces them into for onSubmit (categoryId a
// number, matching CreateBudgetRequest).
type BudgetFormInput = z.input<typeof budgetSchema>;
type BudgetFormOutput = z.output<typeof budgetSchema>;

interface BudgetFormProps {
  /** Present = editing this budget; absent = creating a new one. */
  budget?: BudgetResponse;
  onClose: () => void;
}

/** "1500.5000" -> "1500.5", a friendlier default when editing. */
function trimAmount(amount: string): string {
  return amount.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** Create/edit dialog for a budget — categoryId, amountLimit, currency, period. */
export function BudgetForm({ budget, onClose }: BudgetFormProps) {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();

  const options = categoryOptions(categories ?? []);
  const month = currentMonth();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<BudgetFormInput, unknown, BudgetFormOutput>({
    resolver: zodResolver(budgetSchema),
    defaultValues: budget
      ? {
          categoryId: budget.category.id,
          amountLimit: trimAmount(budget.amountLimit),
          currency: budget.currency,
          periodStart: budget.periodStart,
          periodEnd: budget.periodEnd,
        }
      : {
          categoryId: options[0]?.id ?? 0,
          amountLimit: '',
          currency: profile?.defaultCurrency ?? 'PLN',
          periodStart: month.from,
          periodEnd: month.to,
        },
  });

  const pending = createBudget.isPending || updateBudget.isPending;

  const onSubmit = handleSubmit((values) => {
    const onError = (err: unknown) => {
      setError('root', { message: problemMessages(err).banner });
    };
    if (budget) {
      updateBudget.mutate({ id: budget.id, body: values }, { onSuccess: onClose, onError });
    } else {
      createBudget.mutate(values, { onSuccess: onClose, onError });
    }
  });

  return (
    <Dialog title={budget ? 'Edit budget' : 'Add budget'} onClose={onClose} width={480}>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label htmlFor="budget-category">Category</label>
            <select id="budget-category" className="input" {...register('categoryId')}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
                {errors.categoryId.message}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label htmlFor="budget-amount">Amount limit</label>
              <input
                id="budget-amount"
                className="input"
                inputMode="decimal"
                placeholder="0.00"
                {...register('amountLimit')}
              />
              {errors.amountLimit && (
                <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
                  {errors.amountLimit.message}
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor="budget-currency">Currency</label>
              <input
                id="budget-currency"
                className="input"
                placeholder="PLN"
                {...register('currency')}
              />
              {errors.currency && (
                <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
                  {errors.currency.message}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="field">
              <label htmlFor="budget-period-start">Period start</label>
              <input
                id="budget-period-start"
                className="input"
                type="date"
                {...register('periodStart')}
              />
              {errors.periodStart && (
                <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
                  {errors.periodStart.message}
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor="budget-period-end">Period end</label>
              <input
                id="budget-period-end"
                className="input"
                type="date"
                {...register('periodEnd')}
              />
              {errors.periodEnd && (
                <div className="error-box" style={{ marginTop: 6, fontSize: 12 }}>
                  {errors.periodEnd.message}
                </div>
              )}
            </div>
          </div>
          {errors.root && <div className="error-box">{errors.root.message}</div>}
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
