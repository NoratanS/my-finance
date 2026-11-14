import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api, call, type RequestBody } from '@/api/client'
import {
  errorClass,
  fieldClass,
  hintClass,
  labelClass,
} from '@/components/ui/fieldStyles'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { sectionTitleClass } from '@/components/ui/textStyles'
import { useFormRefusal } from '@/components/ui/useFormRefusal'
import { useSessionMutation } from '@/features/auth/useSessionMutation'
import { currencies, type Currency } from '@/features/signup/currencies'

type AccountChange = RequestBody<'updateAccount'>

const ledgerSchema = z.object({
  currency: z.enum(currencies.map(({ code }) => code) as [Currency]),
}) satisfies z.ZodType<AccountChange>

// Amounts carry no currency of their own, so it is fixed once the ledger has a transaction.
export function LedgerSection({
  currency,
  locked,
}: {
  currency: Currency
  locked: boolean
}) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-3xl bg-surface px-8 py-6"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className={sectionTitleClass}>
          Ledger
        </h2>
        <p className="m-0 text-[13px] text-text-muted">
          Every amount you record uses this currency.
        </p>
      </div>
      {locked ? (
        <FixedCurrency currency={currency} />
      ) : (
        <CurrencyForm currency={currency} titleId={titleId} />
      )}
    </section>
  )
}

function FixedCurrency({ currency }: { currency: Currency }) {
  const currencyId = useId()
  const label = currencies.find(({ code }) => code === currency)?.label
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={currencyId} className={labelClass}>
        Currency
      </label>
      <input
        id={currencyId}
        readOnly
        value={label ?? currency}
        aria-describedby={`${currencyId}-hint`}
        className={`${fieldClass} max-w-[280px]`}
      />
      <div id={`${currencyId}-hint`} className={hintClass}>
        Currency is fixed once you’ve added a transaction.
      </div>
    </div>
  )
}

function CurrencyForm({
  currency,
  titleId,
}: {
  currency: Currency
  titleId: string
}) {
  const updateAccount = useSessionMutation((change: AccountChange) =>
    call(api.PATCH('/api/account', { body: change })),
  )
  const form = useForm<AccountChange>({
    resolver: zodResolver(ledgerSchema),
    defaultValues: { currency },
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form
  const refusal = useFormRefusal(form, ['currency'], {
    error: updateAccount.error,
  })
  const currencyId = useId()

  const saving = updateAccount.isPending
  const onSubmit = (change: AccountChange) => {
    if (saving) return
    updateAccount.mutate(change, { onError: refusal.onError })
  }

  return (
    <>
      {refusal.banner}
      <form
        aria-labelledby={titleId}
        aria-busy={saving}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-1.5"
      >
        <label htmlFor={currencyId} className={labelClass}>
          Currency
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <select
            id={currencyId}
            disabled={saving}
            aria-invalid={errors.currency ? true : undefined}
            aria-describedby={`${currencyId}-hint`}
            className={`${fieldClass} max-w-[280px] flex-[0_1_280px] disabled:text-text-muted`}
            {...register('currency')}
          >
            {currencies.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <SubmitButton
            pending={saving}
            pendingLabel="Saving…"
            className="px-5"
          >
            Save
          </SubmitButton>
        </div>
        <div
          id={`${currencyId}-hint`}
          className={errors.currency ? errorClass : hintClass}
        >
          {errors.currency?.message ??
            'You can change it until you add your first transaction.'}
        </div>
      </form>
    </>
  )
}
