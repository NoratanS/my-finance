import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import { Alert } from '@/components/ui/Alert'
import { Brand } from '@/components/ui/Brand'
import { FormFailure } from '@/components/ui/FormFailure'
import { PageTitle } from '@/components/ui/PageTitle'
import { PasswordField } from '@/components/ui/PasswordField'
import { StateCard } from '@/components/ui/StateCard'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { newPassword } from '@/features/auth/newPassword'
import { passwordResetQueries } from '@/features/password-reset/passwordResetQueries'
import { useResetPassword } from '@/features/password-reset/useResetPassword'
import { AppLoading } from '@/features/shell/AppLoading'

const passwordSchema = z.object({
  password: newPassword,
})
type PasswordFields = z.infer<typeof passwordSchema>

export function ResetPasswordPage() {
  const { token = '' } = useParams()
  const link = useQuery(passwordResetQueries.link(token))

  return (
    <main className="mx-auto box-border flex max-w-[440px] flex-col gap-8 px-6 pt-28 pb-12">
      {link.isPending ? (
        <AppLoading />
      ) : link.isError ? (
        link.error instanceof ApiError && link.error.status === 404 ? (
          <DeadLink />
        ) : (
          <Alert>Couldn’t reach my-finance. Try again.</Alert>
        )
      ) : (
        <ResetForm token={token} email={link.data.email} />
      )}
    </main>
  )
}

function ResetForm({ token, email }: { token: string; email: string }) {
  const navigate = useNavigate()
  const reset = useResetPassword()
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<PasswordFields>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '' },
  })
  const titleId = useId()

  const saving = reset.isPending
  const onSubmit = ({ password }: PasswordFields) => {
    if (saving) return
    reset.mutate(
      { token, password },
      {
        onSuccess: () => void navigate('/', { replace: true }),
        onError: (error) => {
          const message =
            error instanceof ApiError
              ? error.problem?.errors?.password?.[0]
              : undefined
          if (message) setError('password', { message }, { shouldFocus: true })
        },
      },
    )
  }

  return (
    <>
      <header className="flex flex-col items-center gap-2 text-center">
        <Brand />
        <PageTitle id={titleId}>Set a new password</PageTitle>
        <p className="m-0 text-text-muted">For {email}</p>
      </header>

      <form
        aria-labelledby={titleId}
        aria-busy={saving}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-5 rounded-3xl bg-surface p-8"
      >
        {/* A 404 flips the page to the dead-link card. */}
        <FormFailure
          error={reset.error}
          shownByPage={(refusal) =>
            refusal.status === 404 || Boolean(refusal.problem?.errors?.password)
          }
        />
        {/* Lets a password manager file the new password under this email. */}
        <input
          type="email"
          value={email}
          autoComplete="username"
          readOnly
          hidden
        />
        <PasswordField
          label="New password"
          hint="At least 12 characters. A short phrase works well."
          error={errors.password?.message}
          readOnly={saving}
          {...register('password')}
        />
        <div className="text-[13px] text-text-muted">
          Saving it signs you out on your other devices.
        </div>
        <SubmitButton pending={saving} pendingLabel="Saving…">
          Save password
        </SubmitButton>
      </form>

      {/* The API can't read a token's expiry back (Rails keeps it inside the signed token), so no date here. */}
      <p className="m-0 text-center text-[13px] text-text-muted">
        This link works once, within 24 hours of being made.
      </p>
    </>
  )
}

// One card for expired, used and unknown links: the API can't tell them apart.
function DeadLink() {
  return (
    <StateCard
      title="This reset link has expired"
      icon={
        <>
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 4.75V8l2.25 1.5" />
        </>
      }
    >
      <p className="m-0 text-text-muted">
        Reset links work once and last 24 hours. Ask the person who invited you
        for a new one.
      </p>
      <Link
        to="/sign-in"
        className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-accent no-underline"
      >
        Go to sign in
      </Link>
    </StateCard>
  )
}
