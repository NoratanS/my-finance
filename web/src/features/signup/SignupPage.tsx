import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import type { components } from '@/api/schema'
import { Alert } from '@/components/ui/Alert'
import { Brand } from '@/components/ui/Brand'
import { FormFailure } from '@/components/ui/FormFailure'
import {
  errorClass,
  fieldClass,
  hintClass,
  labelClass,
} from '@/components/ui/fieldStyles'
import { PageTitle } from '@/components/ui/PageTitle'
import { PasswordField } from '@/components/ui/PasswordField'
import { StateCard } from '@/components/ui/StateCard'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { newPassword } from '@/features/auth/newPassword'
import { currencies, type Currency } from '@/features/signup/currencies'
import { signupQueries } from '@/features/signup/signupQueries'
import { useSignup } from '@/features/signup/useSignup'
import { AppLoading } from '@/features/shell/AppLoading'
import { formatDayMonthYear } from '@/lib/dates'

type Invite = components['schemas']['Signup']

const accountSchema = z.object({
  password: newPassword,
  currency: z.enum(currencies.map(({ code }) => code) as [Currency]),
})
type AccountFields = z.infer<typeof accountSchema>

export function SignupPage() {
  const { token = '' } = useParams()
  const invite = useQuery(signupQueries.invite(token))

  return (
    <main className="mx-auto box-border flex max-w-[440px] flex-col gap-8 px-6 pt-24 pb-12">
      {invite.isPending ? (
        <AppLoading />
      ) : invite.isError ? (
        invite.error instanceof ApiError && invite.error.status === 404 ? (
          <InvalidInvite />
        ) : (
          <Alert>Couldn’t reach my-finance. Try again.</Alert>
        )
      ) : invite.data.status === 'expired' ? (
        <ExpiredInvite />
      ) : invite.data.status === 'accepted' ? (
        <UsedInvite />
      ) : (
        <SignupForm token={token} invite={invite.data} />
      )}
    </main>
  )
}

function SignupForm({ token, invite }: { token: string; invite: Invite }) {
  const navigate = useNavigate()
  const signup = useSignup()
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<AccountFields>({
    resolver: zodResolver(accountSchema),
    defaultValues: { password: '', currency: 'PLN' },
  })
  const titleId = useId()
  const emailId = useId()
  const currencyId = useId()

  const creating = signup.isPending
  const onSubmit = (fields: AccountFields) => {
    if (creating) return
    signup.mutate(
      { token, ...fields },
      {
        onSuccess: () => void navigate('/', { replace: true }),
        onError: (error) => {
          const fieldErrors =
            error instanceof ApiError ? error.problem?.errors : undefined
          for (const field of ['password', 'currency'] as const) {
            const message = fieldErrors?.[field]?.[0]
            if (message) setError(field, { message }, { shouldFocus: true })
          }
        },
      },
    )
  }
  return (
    <>
      <header className="flex flex-col items-center gap-2 text-center">
        <Brand />
        <PageTitle id={titleId}>Create your account</PageTitle>
        <p className="m-0 text-text-muted">
          You’re invited. Set a password to finish.
        </p>
      </header>

      <form
        aria-labelledby={titleId}
        aria-busy={creating}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-5 rounded-3xl bg-surface p-8"
      >
        {/* A refusal without field errors flips the page to the invite's state instead. */}
        <FormFailure
          error={signup.error}
          shownByPage={({ problem }) =>
            !problem?.errors ||
            Boolean(problem.errors.password ?? problem.errors.currency)
          }
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={emailId} className={labelClass}>
            Email
          </label>
          <div className="relative">
            <input
              id={emailId}
              type="email"
              value={invite.email}
              readOnly
              aria-describedby={`${emailId}-hint`}
              className={`box-border min-h-11 w-full rounded-xl border border-divider bg-transparent pr-10 pl-3 field ${creating ? 'text-text-muted' : 'text-text'}`}
            />
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute top-3.5 right-3.5 text-text-muted"
            >
              <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
            </svg>
          </div>
          <div id={`${emailId}-hint`} className={hintClass}>
            From your invite. It can’t be changed.
          </div>
        </div>

        <PasswordField
          label="Password"
          hint="At least 12 characters. A short phrase works well."
          error={errors.password?.message}
          readOnly={creating}
          {...register('password')}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={currencyId} className={labelClass}>
            Currency
          </label>
          <select
            id={currencyId}
            disabled={creating}
            aria-invalid={errors.currency ? true : undefined}
            aria-describedby={`${currencyId}-hint`}
            className={`${fieldClass} disabled:text-text-muted`}
            {...register('currency')}
          >
            {currencies.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <div
            id={`${currencyId}-hint`}
            className={errors.currency ? errorClass : hintClass}
          >
            {errors.currency?.message ??
              'Every amount in your ledger uses it. You can change it in settings.'}
          </div>
        </div>

        <SubmitButton
          pending={creating}
          pendingLabel="Creating account…"
          className="mt-1"
        >
          Create account
        </SubmitButton>
      </form>

      <p className="m-0 text-center text-[13px] text-text-muted">
        This invite works once, until {formatDayMonthYear(invite.expires_at)}.
      </p>
    </>
  )
}

function ExpiredInvite() {
  return (
    <StateCard
      title="This invite has expired"
      icon={
        <>
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 4.75V8l2.25 1.5" />
        </>
      }
    >
      <p className="m-0 text-text-muted">
        Invites last 7 days. Ask the person who invited you to send a new link.
      </p>
    </StateCard>
  )
}

function UsedInvite() {
  return (
    <StateCard
      title="This invite was already used"
      icon={
        <>
          <circle cx="8" cy="8" r="6.25" />
          <path d="M5.25 8.25 7.25 10.25 10.75 6" />
        </>
      }
    >
      <p className="m-0 text-text-muted">
        An account was made with it. Sign in, or ask the person who invited you
        for a reset link if you’ve forgotten the password.
      </p>
      <Link
        to="/sign-in"
        className="mt-2 inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-7 font-[650] text-accent-ink no-underline hover:text-accent-ink"
      >
        Go to sign in
      </Link>
    </StateCard>
  )
}

function InvalidInvite() {
  return (
    <StateCard
      title="This invite link isn’t valid"
      icon={
        <>
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 4.75v3.75M8 11v.1" />
        </>
      }
    >
      <p className="m-0 text-text-muted">
        It may have been revoked, or cut short when it was copied. Ask the
        person who invited you for a new one.
      </p>
    </StateCard>
  )
}
