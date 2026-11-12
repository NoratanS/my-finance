import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import { Alert } from '@/components/ui/Alert'
import { errorClass, fieldClass, labelClass } from '@/components/ui/fieldStyles'
import { InviteLink } from '@/features/settings/InviteLink'
import { useCreateInvite } from '@/features/settings/useCreateInvite'

const inviteSchema = z.object({
  email: z.email('Enter an email like name@example.com.'),
})
type InviteFields = z.infer<typeof inviteSchema>

const tintedButtonClass =
  'min-h-11 press cursor-pointer rounded-full border-0 bg-accent-tint px-5 text-sm font-[650] text-accent'

export function InviteForm() {
  const createInvite = useCreateInvite()
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setError,
  } = useForm<InviteFields>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '' },
  })
  const titleId = useId()
  const emailId = useId()

  const creating = createInvite.isPending
  const onSubmit = ({ email }: InviteFields) => {
    if (creating) return
    createInvite.mutate(email, {
      onSuccess: () => {
        reset()
      },
      onError: (error) => {
        const message =
          error instanceof ApiError
            ? error.problem?.errors?.email?.[0]
            : undefined
        if (message) setError('email', { message }, { shouldFocus: true })
      },
    })
  }
  const fieldError =
    createInvite.error instanceof ApiError && createInvite.error.problem?.errors

  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-surface px-8 py-6">
      <div className="flex flex-col gap-0.5">
        <h3
          id={titleId}
          className="m-0 text-[17px] leading-[1.25] font-[650] tracking-[-0.008em]"
        >
          Invite someone
        </h3>
        <p className="m-0 text-[13px] text-text-muted">
          You get a single-use link, valid for 7 days. The app doesn’t send
          email, so send it to them yourself.
        </p>
      </div>
      {createInvite.isError && !fieldError && (
        <Alert>Something went wrong. Try again.</Alert>
      )}
      <form
        aria-labelledby={titleId}
        aria-busy={creating}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex min-w-0 flex-[999_1_260px] flex-col gap-1.5">
          <label htmlFor={emailId} className={labelClass}>
            Their email
          </label>
          <input
            id={emailId}
            type="email"
            placeholder="name@example.com"
            readOnly={creating}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? `${emailId}-error` : undefined}
            className={fieldClass}
            {...register('email')}
          />
        </div>
        <button
          type="submit"
          aria-disabled={creating}
          className={`flex-auto ${tintedButtonClass} aria-disabled:cursor-progress`}
        >
          Create invite link
        </button>
        {errors.email && (
          <div id={`${emailId}-error`} className={`w-full ${errorClass}`}>
            {errors.email.message}
          </div>
        )}
      </form>
      {createInvite.data && (
        <InviteLink key={createInvite.data.id} invite={createInvite.data} />
      )}
    </div>
  )
}
