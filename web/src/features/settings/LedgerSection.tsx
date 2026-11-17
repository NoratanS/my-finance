import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
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

type CurrencyChange = Required<Pick<RequestBody<'updateAccount'>, 'currency'>>

const currencySchema = z.object({
  currency: z.enum(currencies.map(({ code }) => code) as [Currency]),
}) satisfies z.ZodType<CurrencyChange>

type TimeZoneChange = Required<Pick<RequestBody<'updateAccount'>, 'time_zone'>>

const timeZoneSchema = z.object({
  time_zone: z.string(),
}) satisfies z.ZodType<TimeZoneChange>

// Amounts carry no currency of their own, so it is fixed once the ledger has a transaction.
// The time zone stays open: changing it never moves a transaction's date.
export function LedgerSection({
  currency,
  locked,
  timeZone,
}: {
  currency: Currency
  locked: boolean
  timeZone: string
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
        <CurrencyForm currency={currency} />
      )}
      <TimeZoneForm timeZone={timeZone} />
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

function CurrencyForm({ currency }: { currency: Currency }) {
  const updateAccount = useSessionMutation((change: CurrencyChange) =>
    call(api.PATCH('/api/account', { body: change })),
  )
  const form = useForm<CurrencyChange>({
    resolver: zodResolver(currencySchema),
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
  const onSubmit = (change: CurrencyChange) => {
    if (saving) return
    updateAccount.mutate(change, { onError: refusal.onError })
  }

  return (
    <>
      {refusal.banner}
      <form
        aria-label="Currency"
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

// "Europe/Warsaw (UTC+01:00)", at the offset in force now; a zone this browser doesn't know shows its name alone.
function timeZoneLabel(timeZone: string, now: Date) {
  try {
    const offset = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(now)
      .find(({ type }) => type === 'timeZoneName')?.value
    // longOffset writes a zero offset as a bare "GMT".
    if (!offset) return timeZone
    return `${timeZone} (${offset === 'GMT' ? 'UTC+00:00' : offset.replace('GMT', 'UTC')})`
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return timeZone
  }
}

// The browser's zones, plus the stored one if it isn't among them (the API knows more, e.g. UTC).
function timeZoneOptions(stored: string) {
  const now = new Date()
  const zones = Intl.supportedValuesOf('timeZone')
  const offered = zones.includes(stored) ? zones : [...zones, stored].sort()
  return offered.map((zone) => ({ zone, label: timeZoneLabel(zone, now) }))
}

function TimeZoneForm({ timeZone }: { timeZone: string }) {
  // Built once: several hundred zones, each formatted for its offset.
  const [options] = useState(() => timeZoneOptions(timeZone))
  const updateAccount = useSessionMutation((change: TimeZoneChange) =>
    call(api.PATCH('/api/account', { body: change })),
  )
  const form = useForm<TimeZoneChange>({
    resolver: zodResolver(timeZoneSchema),
    defaultValues: { time_zone: timeZone },
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form
  const refusal = useFormRefusal(form, ['time_zone'], {
    error: updateAccount.error,
  })
  const timeZoneId = useId()

  const saving = updateAccount.isPending
  const onSubmit = (change: TimeZoneChange) => {
    if (saving) return
    updateAccount.mutate(change, { onError: refusal.onError })
  }

  return (
    <>
      {refusal.banner}
      <form
        aria-label="Time zone"
        aria-busy={saving}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-1.5"
      >
        <label htmlFor={timeZoneId} className={labelClass}>
          Time zone
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <select
            id={timeZoneId}
            disabled={saving}
            aria-invalid={errors.time_zone ? true : undefined}
            aria-describedby={`${timeZoneId}-hint`}
            className={`${fieldClass} max-w-[280px] flex-[0_1_280px] disabled:text-text-muted`}
            {...register('time_zone')}
          >
            {options.map(({ zone, label }) => (
              <option key={zone} value={zone}>
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
          id={`${timeZoneId}-hint`}
          className={errors.time_zone ? errorClass : hintClass}
        >
          {errors.time_zone?.message ??
            'Decides what today and this month mean for your ledger.'}
        </div>
      </form>
    </>
  )
}
