import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import { FormFailure } from '@/components/ui/FormFailure'
import { PasswordField } from '@/components/ui/PasswordField'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { newPassword } from '@/features/auth/newPassword'
import {
  type PasswordChange,
  useChangePassword,
} from '@/features/settings/useChangePassword'

const passwordChangeSchema = z.object({
  current_password: z.string().min(1, 'Enter your current password.'),
  password: newPassword,
}) satisfies z.ZodType<PasswordChange>

export function PasswordSection({ email }: { email: string }) {
  const changePassword = useChangePassword()
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setError,
  } = useForm<PasswordChange>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { current_password: '', password: '' },
  })
  const titleId = useId()

  const saving = changePassword.isPending
  const onSubmit = (change: PasswordChange) => {
    if (saving) return
    changePassword.mutate(change, {
      onSuccess: () => {
        reset()
      },
      onError: (error) => {
        const fieldErrors =
          error instanceof ApiError ? error.problem?.errors : undefined
        let focused = false
        for (const field of ['current_password', 'password'] as const) {
          const message = fieldErrors?.[field]?.[0]
          if (!message) continue
          // Focus the first refused field, in form order.
          setError(field, { message }, { shouldFocus: !focused })
          focused = true
        }
      },
    })
  }

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-3xl bg-surface px-8 py-6"
    >
      <h2
        id={titleId}
        className="m-0 text-xl leading-[1.2] font-[650] tracking-[-0.012em]"
      >
        Password
      </h2>
      {changePassword.isSuccess && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl bg-income/12 px-3.5 py-3 text-sm font-medium text-income"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 flex-none"
          >
            <path d="M3 8.5 6.5 12 13 4.5" />
          </svg>
          <span>Password changed. Your other devices are signed out.</span>
        </div>
      )}
      <FormFailure
        error={changePassword.error}
        shownByPage={({ problem }) =>
          Boolean(
            problem?.errors?.current_password ?? problem?.errors?.password,
          )
        }
      />
      <form
        aria-labelledby={titleId}
        aria-busy={saving}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex max-w-[400px] flex-col gap-4"
      >
        {/* Lets a password manager file the new password under this email. */}
        <input
          type="email"
          value={email}
          autoComplete="username"
          readOnly
          hidden
        />
        <PasswordField
          label="Current password"
          showLabel="Show current password"
          autoComplete="current-password"
          error={errors.current_password?.message}
          readOnly={saving}
          {...register('current_password')}
        />
        <PasswordField
          label="New password"
          hint="At least 12 characters. Changing it signs you out on your other devices."
          showLabel="Show new password"
          error={errors.password?.message}
          readOnly={saving}
          {...register('password')}
        />
        <SubmitButton
          pending={saving}
          pendingLabel="Changing password…"
          className="self-start px-5"
        >
          Change password
        </SubmitButton>
      </form>
    </section>
  )
}
