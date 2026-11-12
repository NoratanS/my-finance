import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { type Credentials, useSignIn } from '@/features/auth/useSignIn'

const credentialsSchema = z.object({
  email: z.email('Enter an email like name@example.com.'),
  password: z.string().min(1, 'Enter your password.'),
}) satisfies z.ZodType<Credentials>

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
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  })
  const titleId = useId()
  const emailId = useId()
  const passwordId = useId()

  const onSubmit = (credentials: Credentials) => {
    signIn.mutate(credentials, {
      onSuccess: () => void navigate('/', { replace: true }),
    })
  }

  return (
    <main className="mx-auto box-border flex max-w-[440px] flex-col gap-8 px-6 pt-28 pb-12">
      <header className="flex flex-col items-center gap-2 text-center">
        <div className="font-[650] tracking-[-0.01em] text-text-muted">
          my-finance
        </div>
        <h1
          id={titleId}
          className="m-0 text-[40px] leading-[1.08] font-bold tracking-[-0.024em]"
        >
          Sign in
        </h1>
      </header>

      <form
        aria-labelledby={titleId}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-5 rounded-3xl bg-surface p-8"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={emailId} className={labelClass}>
            Email
          </label>
          <input
            id={emailId}
            type="email"
            autoComplete="username"
            placeholder="name@example.com"
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
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={
                errors.password ? `${passwordId}-error` : undefined
              }
              className={`${fieldClass} pr-[72px]`}
              {...register('password')}
            />
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
          </div>
          {errors.password && (
            <div id={`${passwordId}-error`} className="text-[13px] text-danger">
              {errors.password.message}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="mt-1 min-h-12 press cursor-pointer rounded-full border-0 bg-accent font-[650] text-accent-ink"
        >
          Sign in
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
