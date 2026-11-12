import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { ApiError, isUnauthorized } from '@/api/client'
import { Alert } from '@/components/ui/Alert'
import { PageTitle } from '@/components/ui/PageTitle'
import { type Credentials, useSignIn } from '@/features/auth/useSignIn'

const credentialsSchema = z.object({
  email: z.email('Enter an email like name@example.com.'),
  password: z.string().min(1, 'Enter your password.'),
}) satisfies z.ZodType<Credentials>

// The API's rate-limit window; it sends no wait time, so the button waits the whole window.
const RATE_LIMIT_WINDOW_MS = 3 * 60_000

const labelClass = 'text-[13px] font-semibold text-text-muted'
const fieldClass =
  'field box-border min-h-11 w-full rounded-xl border border-transparent bg-surface-2 px-3 text-text aria-invalid:border-danger read-only:text-text-muted'

export function SignInPage() {
  const navigate = useNavigate()
  const signIn = useSignIn()
  const [passwordShown, setPasswordShown] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
    resetField,
    setFocus,
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  })
  const rateLimited =
    signIn.error instanceof ApiError && signIn.error.status === 429
  const { reset: endWait } = signIn
  useEffect(() => {
    if (!rateLimited) return
    const timer = setTimeout(endWait, RATE_LIMIT_WINDOW_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [rateLimited, endWait])
  const titleId = useId()
  const emailId = useId()
  const passwordId = useId()

  const signingIn = signIn.isPending
  const onSubmit = (credentials: Credentials) => {
    if (signingIn) return
    signIn.mutate(credentials, {
      onSuccess: () => void navigate('/', { replace: true }),
      onError: (error) => {
        if (!isUnauthorized(error)) return
        resetField('password')
        setFocus('password')
      },
    })
  }

  return (
    <main className="mx-auto box-border flex max-w-[440px] flex-col gap-8 px-6 pt-28 pb-12">
      <header className="flex flex-col items-center gap-2 text-center">
        <div className="font-[650] tracking-[-0.01em] text-text-muted">
          my-finance
        </div>
        <PageTitle id={titleId}>Sign in</PageTitle>
      </header>

      <form
        aria-labelledby={titleId}
        aria-busy={signingIn}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-5 rounded-3xl bg-surface p-8"
      >
        {rateLimited ? (
          <RateLimitNotice />
        ) : (
          signIn.error && <SignInFailure error={signIn.error} />
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={emailId} className={labelClass}>
            Email
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="username"
            placeholder="name@example.com"
            readOnly={signingIn}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? `${emailId}-error` : undefined}
            className={fieldClass}
            {...register('email')}
          />
          {errors.email && (
            <div id={`${emailId}-error`} className="text-[13px] text-danger">
              {errors.email.message}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={passwordId} className={labelClass}>
            Password
          </label>
          <div className="relative">
            <input
              id={passwordId}
              type={passwordShown ? 'text' : 'password'}
              autoComplete="current-password"
              readOnly={signingIn}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={
                errors.password ? `${passwordId}-error` : undefined
              }
              className={`${fieldClass} pr-[72px]`}
              {...register('password')}
            />
            {!signingIn && (
              <button
                type="button"
                aria-label="Show password"
                aria-controls={passwordId}
                aria-pressed={passwordShown}
                onClick={() => {
                  setPasswordShown((shown) => !shown)
                }}
                className="absolute top-0 right-0.5 min-h-11 cursor-pointer rounded-[10px] border-0 bg-transparent px-3 text-sm font-semibold text-accent"
              >
                Show
              </button>
            )}
          </div>
          {errors.password && (
            <div id={`${passwordId}-error`} className="text-[13px] text-danger">
              {errors.password.message}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={rateLimited}
          aria-disabled={signingIn}
          className="mt-1 min-h-12 press cursor-pointer rounded-full border-0 bg-accent font-[650] text-accent-ink disabled:cursor-not-allowed disabled:bg-white/8 disabled:text-text-muted aria-disabled:cursor-progress"
        >
          {signingIn ? (
            <span className="inline-flex items-center justify-center gap-2.5">
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="animate-spin motion-reduce:animate-none"
              >
                <path d="M8 2a6 6 0 1 1-6 6" />
              </svg>
              Signing in…
            </span>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <div className="flex flex-col gap-1 text-center text-[13px] text-text-muted">
        <p className="m-0">my-finance is invite-only.</p>
        <p className="m-0">
          Forgot your password? Ask the person who invited you for a reset link.
        </p>
      </div>
    </main>
  )
}

function SignInFailure({ error }: { error: Error }) {
  return (
    <Alert>
      {isUnauthorized(error)
        ? 'That email and password don’t match. Try again.'
        : 'Couldn’t reach my-finance. Try again.'}
    </Alert>
  )
}

function RateLimitNotice() {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl bg-over/12 px-3.5 py-3 text-sm font-medium text-over"
    >
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
        className="mt-0.5 flex-none"
      >
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 4.75V8l2.25 1.5" />
      </svg>
      <span>Too many attempts. Try again in a few minutes.</span>
    </div>
  )
}
