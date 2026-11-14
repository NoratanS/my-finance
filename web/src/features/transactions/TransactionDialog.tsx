import { zodResolver } from '@hookform/resolvers/zod'
import { useId, type RefObject } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { isUnreachable, status } from '@/api/client'
import type { components } from '@/api/schema'
import { Alert } from '@/components/ui/Alert'
import { ghostButtonClass } from '@/components/ui/buttonStyles'
import { dialogClass } from '@/components/ui/dialogStyles'
import { errorClass, fieldClass, labelClass } from '@/components/ui/fieldStyles'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { useFormRefusal } from '@/components/ui/useFormRefusal'
import { useSheetDrag } from '@/components/ui/useSheetDrag'
import { useSaveTransaction } from '@/features/transactions/useSaveTransaction'
import { formatCalendarDate, localToday } from '@/lib/dates'
import {
  type AmountProblem,
  formatAmount,
  formatAmountInput,
  maxAmount,
  parseAmount,
} from '@/lib/money'

type Currency = components['schemas']['Currency']
type Kind = components['schemas']['Kind']
type Transaction = components['schemas']['Transaction']
type TransactionInput = components['schemas']['TransactionInput']

const descriptionLimit = 200
// The API refuses older dates: they'd sit outside every list yet lock the currency.
const firstDate = '2000-01-01'

const amountMessages = (currency: Currency): Record<AmountProblem, string> => ({
  minus: 'Type the amount without a minus. Type carries the sign.',
  notANumber: 'Enter an amount like 84,20.',
  notPositive: 'Enter an amount above 0.',
  tooLarge: `Amounts go up to ${formatAmount(maxAmount, currency)}.`,
})

// A transaction's rules, checked before saving so each shows on its own field; the API holds the same ones.
const transactionSchema = (currency: Currency) =>
  z.object({
    amount: z.string().transform((typed, context) => {
      const parsed = parseAmount(typed)
      if ('minor' in parsed) return parsed.minor
      context.addIssue({
        code: 'custom',
        message: amountMessages(currency)[parsed.problem],
      })
      return z.NEVER
    }),
    kind: z.enum(['expense', 'income'] satisfies Kind[]),
    date: z.string().superRefine((date, context) => {
      const today = localToday()
      if (date === '')
        context.addIssue({ code: 'custom', message: 'Pick a date.' })
      else if (date > today)
        context.addIssue({
          code: 'custom',
          message: `The date can’t be after today (${formatCalendarDate(today)}).`,
        })
      else if (date < firstDate)
        context.addIssue({
          code: 'custom',
          message: `The date can’t be before ${formatCalendarDate(firstDate)}.`,
        })
    }),
    description: z
      .string()
      .trim()
      .max(descriptionLimit, 'Keep it to 200 characters.'),
  }) satisfies z.ZodType<TransactionInput>

type TransactionSchema = ReturnType<typeof transactionSchema>

const phoneHeaderButtonClass =
  'min-h-11 min-w-[76px] press cursor-pointer border-0 bg-transparent px-3 text-[16px] text-accent md:hidden'
const phoneRowLabelClass =
  'max-md:flex-none max-md:text-[16px] max-md:font-normal max-md:text-text'
const phoneRowFieldClass =
  'max-md:min-w-0 max-md:border-0 max-md:bg-transparent max-md:px-0 max-md:text-right max-md:text-[16px]'

const kinds: { kind: Kind; label: string }[] = [
  { kind: 'expense', label: 'Expense' },
  { kind: 'income', label: 'Income' },
]

// A native modal <dialog>, like MoreSheet: showModal() gives the focus trap, Escape and focus return.
// With a transaction it edits that one, prefilled from its list row.
export function TransactionDialog({
  ref,
  currency,
  transaction,
  onSaved,
  onDelete,
}: {
  ref: RefObject<HTMLDialogElement | null>
  currency: Currency
  transaction?: Transaction
  onSaved: () => void
  onDelete: (transaction: Transaction) => void
}) {
  const saveTransaction = useSaveTransaction(transaction?.id)
  const form = useForm<
    z.input<TransactionSchema>,
    unknown,
    z.output<TransactionSchema>
  >({
    resolver: zodResolver(transactionSchema(currency)),
    mode: 'onTouched',
    defaultValues: transaction
      ? {
          amount: formatAmountInput(transaction.amount),
          kind: transaction.kind,
          date: transaction.date,
          description: transaction.description,
        }
      : { amount: '', kind: 'expense', date: localToday(), description: '' },
  })
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitted },
  } = form
  const refusal = useFormRefusal(
    form,
    ['amount', 'kind', 'date', 'description'],
    {
      error: saveTransaction.error,
      says: { [status.notFound]: 'This transaction was deleted elsewhere.' },
    },
  )
  const kind = useWatch({ control, name: 'kind' })
  const description = useWatch({ control, name: 'description' })
  const { grabberRef, dragHandleProps, backdropProps } = useSheetDrag(ref)
  const titleId = useId()
  const fieldId = useId()
  const ids = {
    amount: `${fieldId}-amount`,
    type: `${fieldId}-type`,
    date: `${fieldId}-date`,
    description: `${fieldId}-description`,
  }

  const close = () => {
    ref.current?.close()
  }
  const saving = saveTransaction.isPending
  const onSubmit = (fields: z.output<TransactionSchema>) => {
    if (saving) return
    saveTransaction.mutate(fields, {
      onSuccess: () => {
        close()
        onSaved()
      },
      onError: refusal.onError,
    })
  }

  const submit = () => void handleSubmit(onSubmit)()
  // Nothing typed is wrong, so the dialog stays open with it for another try.
  const saveFailed =
    saveTransaction.error !== null && isUnreachable(saveTransaction.error)
  const invalidCount = Object.keys(errors).length
  const descriptionLength = description.trim().length
  const describedBy = (field: keyof typeof ids, extra?: string) =>
    [errors[field as keyof typeof errors] && `${ids[field]}-error`, extra]
      .filter(Boolean)
      .join(' ') || undefined

  const deleteThis = () => {
    if (transaction) onDelete(transaction)
  }

  // One dialog at every width, so rotating the phone keeps what was typed.
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      {...backdropProps}
      className={`${dialogClass} w-[min(480px,calc(100%-2rem))] p-0 max-md:fixed max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:m-0 ${transaction ? 'max-md:h-[calc(100dvh-52px)]' : 'max-md:h-[85dvh]'} max-md:max-h-[calc(100dvh-env(safe-area-inset-top))] max-md:w-full max-md:overflow-y-auto max-md:overscroll-contain max-md:rounded-b-none max-md:border-x-0 max-md:border-b-0 max-md:shadow-[0_-12px_48px_rgba(0,0,0,0.5)] max-md:backdrop:bg-black/50`}
    >
      <form
        aria-labelledby={titleId}
        aria-busy={saving}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-4 p-7 max-md:min-h-full max-md:gap-0 max-md:p-0 max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div
          {...dragHandleProps}
          className="flex flex-col gap-0.5 max-md:cursor-grab max-md:touch-none max-md:items-center max-md:px-2 max-md:pt-2 max-md:pb-1 max-md:select-none"
        >
          <span
            ref={grabberRef}
            aria-hidden="true"
            className="h-[5px] w-9 rounded-[3px] bg-text-muted/50 md:hidden"
          />
          <div className="flex w-full items-center justify-between">
            <button
              type="button"
              onClick={close}
              className={`${phoneHeaderButtonClass} text-left`}
            >
              Cancel
            </button>
            <h2
              id={titleId}
              className="m-0 mb-1 text-[22px] leading-[1.2] font-bold tracking-[-0.016em] max-md:mb-0 max-md:text-[16px] max-md:font-[650] max-md:tracking-[-0.005em]"
            >
              {transaction ? 'Edit transaction' : 'Add transaction'}
            </h2>
            <button
              type="submit"
              aria-disabled={saving}
              className={`${phoneHeaderButtonClass} text-right font-[650] aria-disabled:cursor-progress`}
            >
              Save
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 max-md:px-4 max-md:pt-2">
          {isSubmitted && invalidCount > 0 ? (
            <Alert>
              {invalidCount === 1
                ? 'Fix the field marked below.'
                : `Fix the ${String(invalidCount)} fields marked below.`}
            </Alert>
          ) : saveFailed ? (
            <RetryAlert onRetry={submit}>
              Couldn’t save the transaction.
            </RetryAlert>
          ) : (
            refusal.banner
          )}

          <div className="flex flex-col gap-1.5 max-md:items-center max-md:gap-1 max-md:pt-2 max-md:pb-1">
            <span>
              <label htmlFor={ids.amount} className={labelClass}>
                Amount
              </label>
              <span aria-hidden="true" className={`${labelClass} md:hidden`}>
                {' '}
                ({currency})
              </span>
            </span>
            <div className="relative w-full">
              <input
                id={ids.amount}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                readOnly={saving}
                aria-invalid={errors.amount ? true : undefined}
                aria-describedby={describedBy('amount')}
                className={`${fieldClass} min-h-14 pr-[76px] pl-3.5 text-[28px] font-[650] tracking-[-0.018em] tabular-nums max-md:min-h-16 max-md:border-0 max-md:bg-transparent max-md:px-0 max-md:text-center max-md:text-[52px] max-md:leading-[1.1] max-md:font-bold max-md:tracking-[-0.03em]`}
                {...register('amount', {
                  onBlur: (event: { target: HTMLInputElement }) => {
                    const parsed = parseAmount(event.target.value)
                    if ('minor' in parsed)
                      setValue('amount', formatAmountInput(parsed.minor))
                  },
                })}
              />
              <span
                aria-hidden="true"
                className="absolute top-3.5 right-4 text-xl font-semibold text-text-muted max-md:hidden"
              >
                {currency}
              </span>
            </div>
            <FieldError
              id={`${ids.amount}-error`}
              message={errors.amount?.message}
            />
          </div>

          <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-x-3">
            <div className="flex flex-col gap-1.5">
              <span id={ids.type} className={`${labelClass} max-md:sr-only`}>
                Type
              </span>
              <div
                role="group"
                aria-labelledby={ids.type}
                className="grid grid-cols-2 rounded-xl bg-surface-2 p-[3px]"
              >
                {kinds.map((option) => (
                  <button
                    key={option.kind}
                    type="button"
                    aria-pressed={kind === option.kind}
                    onClick={() => {
                      setValue('kind', option.kind)
                    }}
                    className="min-h-[38px] cursor-pointer rounded-[9px] border-0 bg-transparent text-sm font-medium text-text-muted aria-pressed:bg-[#4a4a52] aria-pressed:font-semibold aria-pressed:text-text aria-pressed:shadow-[0_1px_3px_rgba(0,0,0,0.4)] max-md:min-h-11 max-md:text-[15px]"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col rounded-[20px] bg-surface-2 px-4 md:contents">
              <div className="flex flex-col gap-1.5 max-md:min-h-13 max-md:flex-row max-md:items-center max-md:justify-between max-md:gap-3">
                <label
                  htmlFor={ids.date}
                  className={`${labelClass} ${phoneRowLabelClass}`}
                >
                  Date
                </label>
                <input
                  id={ids.date}
                  type="date"
                  min={firstDate}
                  max={localToday()}
                  readOnly={saving}
                  aria-invalid={errors.date ? true : undefined}
                  aria-describedby={describedBy('date')}
                  className={`${fieldClass} ${phoneRowFieldClass} max-md:w-auto max-md:text-text-muted`}
                  {...register('date')}
                />
              </div>
              <div className="max-md:pb-2 max-md:empty:hidden md:col-span-2">
                <FieldError
                  id={`${ids.date}-error`}
                  message={errors.date?.message}
                />
              </div>

              <div className="flex flex-col gap-1.5 max-md:min-h-13 max-md:flex-row max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:border-t max-md:border-divider md:col-span-2">
                <div className="flex items-baseline justify-between gap-2 max-md:flex-none">
                  <label
                    htmlFor={ids.description}
                    className={`${labelClass} ${phoneRowLabelClass}`}
                  >
                    Description{' '}
                    <span className="font-normal max-md:text-text-muted">
                      · optional
                    </span>
                  </label>
                  {descriptionLength > descriptionLimit && (
                    <span
                      id={`${ids.description}-count`}
                      className="text-[13px] text-danger tabular-nums"
                    >
                      {descriptionLength} / {descriptionLimit}
                    </span>
                  )}
                </div>
                <input
                  id={ids.description}
                  placeholder="e.g. Weekly groceries"
                  readOnly={saving}
                  aria-invalid={errors.description ? true : undefined}
                  aria-describedby={describedBy(
                    'description',
                    descriptionLength > descriptionLimit
                      ? `${ids.description}-count`
                      : undefined,
                  )}
                  className={`${fieldClass} ${phoneRowFieldClass} max-md:flex-1 max-md:placeholder:text-transparent`}
                  {...register('description')}
                />
                <div className="empty:hidden max-md:basis-full max-md:pb-2">
                  <FieldError
                    id={`${ids.description}-error`}
                    message={errors.description?.message}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 max-md:flex-col max-md:items-stretch max-md:pt-0">
            {transaction && (
              <button
                type="button"
                onClick={deleteThis}
                className="mr-auto min-h-11 press cursor-pointer rounded-full border-0 bg-transparent px-3.5 text-sm font-semibold text-danger max-md:hidden"
              >
                Delete…
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className={`${ghostButtonClass} max-md:hidden`}
            >
              Cancel
            </button>
            <SubmitButton
              pending={saving}
              pendingLabel="Saving…"
              className="min-h-11 px-[18px] text-sm max-md:min-h-13 max-md:text-[16px]"
            >
              {transaction ? 'Save changes' : 'Save transaction'}
            </SubmitButton>
            {transaction && (
              <button
                type="button"
                onClick={deleteThis}
                className="min-h-13 press cursor-pointer rounded-full border-0 bg-danger/12 text-[16px] font-semibold text-danger md:hidden"
              >
                Delete transaction
              </button>
            )}
          </div>
        </div>
      </form>
    </dialog>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <div id={id} className={errorClass}>
      {message}
    </div>
  )
}
