import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import {
  api,
  call,
  isUnauthorized,
  type RequestBody,
  status,
} from '@/api/client'
import { fieldClass, labelClass } from '@/components/ui/fieldStyles'
import { PageTitle } from '@/components/ui/PageTitle'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { useFormRefusal } from '@/components/ui/useFormRefusal'
import { useSessionMutation } from '@/features/auth/useSessionMutation'

export type Credentials = RequestBody<'createSession'>

const credentialsSchema = z.object({
  email: z.email('Enter an email like name@example.com.'),
  password: z.string().min(1, 'Enter your password.'),
}) satisfies z.ZodType<Credentials>

export function SignInPage() {
  const navigate = useNavigate()
  const signIn = useSessionMutation(
    (credentials: Credentials) =>
      call(api.POST('/api/session', { body: credentials })),
    { signsIn: true },
  )
  const [passwordShown, setPasswordShown] = useState(false)
  const form = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
    resetField,
    setFocus,
  } = form
  const refusal = useFormRefusal(form, ['email', 'password'], {
    error: signIn.error,
    says: {
      [status.unauthorized]: 'That email and password don’t match. Try again.',
    },
  })
  const titleId = useId()
  const emailId = useId()
  const passwordId = useId()

  const signingIn = signIn.isPending
  const onSubmit = (credentials: Credentials) => {
    if (signingIn) return
    signIn.mutate(credentials, {
      onSuccess: () => void navigate('/', { replace: true }),
      onError: (error) => {
        refusal.onError(error)
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
        {refusal.banner}
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

        <SubmitButton
          pending={signingIn}
          pendingLabel="Signing in…"
          disabled={refusal.waiting}
          className="mt-1"
        >
          Sign in
        </SubmitButton>
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
