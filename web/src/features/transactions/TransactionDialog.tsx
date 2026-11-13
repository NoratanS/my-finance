import { zodResolver } from '@hookform/resolvers/zod'
import { useId, type RefObject } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import type { components } from '@/api/schema'
import { Alert } from '@/components/ui/Alert'
import { errorClass, fieldClass, labelClass } from '@/components/ui/fieldStyles'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { useFormRefusal } from '@/components/ui/useFormRefusal'
import { useCreateTransaction } from '@/features/transactions/useCreateTransaction'
import { formatCalendarDate, localToday } from '@/lib/dates'
import {
  type AmountProblem,
  formatAmount,
  formatAmountInput,
  maxAmount,
  parseAmount,
} from '@/lib/money'

type Kind = components['schemas']['Kind']

const descriptionLimit = 200
// The API refuses older dates: they'd sit outside every list yet lock the currency.
const firstDate = '2000-01-01'

const amountMessages = (currency: string): Record<AmountProblem, string> => ({
  minus: 'Type the amount without a minus. Type carries the sign.',
  notANumber: 'Enter an amount like 84,20.',
  notPositive: 'Enter an amount above 0.',
  tooLarge: `Amounts go up to ${formatAmount(maxAmount, currency)}.`,
})

// The API's rules (TxnValidation), checked here first so each shows on its field.
const transactionSchema = (currency: string) =>
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
    kind: z.enum(['expense', 'income']),
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
  })

type TransactionSchema = ReturnType<typeof transactionSchema>

const kinds: { kind: Kind; label: string }[] = [
  { kind: 'expense', label: 'Expense' },
  { kind: 'income', label: 'Income' },
]

// A native modal <dialog>, like MoreSheet: showModal() gives the focus trap, Escape and focus return.
export function TransactionDialog({
  ref,
  currency,
}: {
  ref: RefObject<HTMLDialogElement | null>
  currency: string
}) {
  const createTransaction = useCreateTransaction()
  const form = useForm<
    z.input<TransactionSchema>,
    unknown,
    z.output<TransactionSchema>
  >({
    resolver: zodResolver(transactionSchema(currency)),
    mode: 'onTouched',
    defaultValues: {
      amount: '',
      kind: 'expense',
      date: localToday(),
      description: '',
    },
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
    { error: createTransaction.error },
  )
  const kind = useWatch({ control, name: 'kind' })
  const description = useWatch({ control, name: 'description' })
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
  const saving = createTransaction.isPending
  const onSubmit = (transaction: z.output<TransactionSchema>) => {
    if (saving) return
    createTransaction.mutate(transaction, {
      onSuccess: close,
      onError: refusal.onError,
    })
  }

  const invalidCount = Object.keys(errors).length
  const descriptionLength = description.trim().length
  const describedBy = (field: keyof typeof ids, extra?: string) =>
    [errors[field as keyof typeof errors] && `${ids[field]}-error`, extra]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="m-auto box-border w-[min(480px,calc(100%-2rem))] max-w-none rounded-[28px] border border-white/10 bg-[#1e1e22] p-7 text-text shadow-[0_24px_80px_rgba(0,0,0,0.6)] backdrop:bg-black/52"
    >
      <form
        aria-labelledby={titleId}
        aria-busy={saving}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-4"
      >
        <h2
          id={titleId}
          className="m-0 mb-1 text-[22px] leading-[1.2] font-bold tracking-[-0.016em]"
        >
          Add transaction
        </h2>
        {isSubmitted && invalidCount > 0 ? (
          <Alert>
            {invalidCount === 1
              ? 'Fix the field marked below.'
              : `Fix the ${String(invalidCount)} fields marked below.`}
          </Alert>
        ) : (
          refusal.banner
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.amount} className={labelClass}>
            Amount
          </label>
          <div className="relative">
            <input
              id={ids.amount}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              readOnly={saving}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={describedBy('amount')}
              className={`${fieldClass} min-h-14 pr-[76px] pl-3.5 text-[28px] font-[650] tracking-[-0.018em] tabular-nums`}
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
              className="absolute top-3.5 right-4 text-xl font-semibold text-text-muted"
            >
              {currency}
            </span>
          </div>
          <FieldError
            id={`${ids.amount}-error`}
            message={errors.amount?.message}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span id={ids.type} className={labelClass}>
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
                  className="min-h-[38px] cursor-pointer rounded-[9px] border-0 bg-transparent text-sm font-medium text-text-muted aria-pressed:bg-[#4a4a52] aria-pressed:font-semibold aria-pressed:text-text aria-pressed:shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.date} className={labelClass}>
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
              className={fieldClass}
              {...register('date')}
            />
          </div>
        </div>
        <FieldError id={`${ids.date}-error`} message={errors.date?.message} />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor={ids.description} className={labelClass}>
              Description <span className="font-normal">· optional</span>
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
            className={fieldClass}
            {...register('description')}
          />
          <FieldError
            id={`${ids.description}-error`}
            message={errors.description?.message}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={close}
            className="min-h-11 press cursor-pointer rounded-full border border-divider bg-white/6 px-[18px] text-sm font-semibold text-text"
          >
            Cancel
          </button>
          <SubmitButton
            pending={saving}
            pendingLabel="Saving…"
            className="min-h-11 px-[18px] text-sm"
          >
            Save transaction
          </SubmitButton>
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
