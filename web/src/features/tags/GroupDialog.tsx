import { zodResolver } from '@hookform/resolvers/zod'
import { useId, type RefObject } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { isUnreachable } from '@/api/client'
import type { components } from '@/api/schema'
import { ghostButtonClass } from '@/components/ui/buttonStyles'
import { dialogClass } from '@/components/ui/dialogStyles'
import {
  errorClass,
  fieldClass,
  hintClass,
  labelClass,
} from '@/components/ui/fieldStyles'
import { RetryAlert } from '@/components/ui/RetryAlert'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { useFormRefusal } from '@/components/ui/useFormRefusal'
import { tagName } from '@/features/tags/tagName'
import { useSaveTagGroup } from '@/features/tags/useSaveTagGroup'

type TagGroup = components['schemas']['TagGroup']
type TagGroupInput = components['schemas']['TagGroupInput']

const groupSchema = z.object({
  name: tagName('Name the group.'),
}) satisfies z.ZodType<TagGroupInput>

// New group, or Rename group when given one; a native modal <dialog>, like NewTagDialog.
export function GroupDialog({
  ref,
  group,
  onSaved,
}: {
  ref: RefObject<HTMLDialogElement | null>
  group?: TagGroup
  onSaved?: (group: TagGroup) => void
}) {
  const saveGroup = useSaveTagGroup(group?.id)
  const form = useForm<
    z.input<typeof groupSchema>,
    unknown,
    z.output<typeof groupSchema>
  >({
    resolver: zodResolver(groupSchema),
    mode: 'onTouched',
    defaultValues: { name: group?.name ?? '' },
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form
  const refusal = useFormRefusal(form, ['name'], {
    error: saveGroup.error,
    says: { 404: 'This group was deleted elsewhere.' },
  })
  const titleId = useId()
  const nameId = useId()
  const renaming = group !== undefined

  const close = () => {
    ref.current?.close()
  }
  const saving = saveGroup.isPending
  const onSubmit = (input: z.output<typeof groupSchema>) => {
    if (saving) return
    saveGroup.mutate(input, {
      onSuccess: (saved) => {
        close()
        onSaved?.(saved)
      },
      onError: refusal.onError,
    })
  }
  const submit = () => void handleSubmit(onSubmit)()
  // Nothing typed is wrong, so the dialog stays open with it for another try.
  const saveFailed = saveGroup.error !== null && isUnreachable(saveGroup.error)
  const title = renaming ? 'Rename group' : 'New group'

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`${dialogClass} w-[min(440px,calc(100%-2rem))] p-0`}
    >
      <form
        aria-labelledby={titleId}
        aria-busy={saving}
        noValidate
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-4 p-7"
      >
        <h2
          id={titleId}
          className="m-0 mb-1 text-[22px] leading-[1.2] font-bold tracking-[-0.016em]"
        >
          {title}
        </h2>
        {saveFailed ? (
          <RetryAlert onRetry={submit}>
            {renaming
              ? 'Couldn’t rename the group.'
              : 'Couldn’t create the group.'}
          </RetryAlert>
        ) : (
          refusal.banner
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className={labelClass}>
            Name
          </label>
          <input
            id={nameId}
            autoComplete="off"
            readOnly={saving}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={`${nameId}-${errors.name ? 'error' : 'hint'}`}
            className={fieldClass}
            {...register('name')}
          />
          {errors.name ? (
            <div id={`${nameId}-error`} className={errorClass}>
              {errors.name.message}
            </div>
          ) : (
            <span id={`${nameId}-hint`} className={hintClass}>
              Up to 40 characters. Letter case doesn’t matter.
            </span>
          )}
        </div>
        {!renaming && (
          <p className={`m-0 ${hintClass}`}>
            Starts empty. Put a tag in it from the tag’s details.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button type="button" onClick={close} className={ghostButtonClass}>
            Cancel
          </button>
          <SubmitButton
            pending={saving}
            pendingLabel={renaming ? 'Saving…' : 'Creating…'}
            className="min-h-11 px-[18px] text-sm"
          >
            {renaming ? 'Save name' : 'Create group'}
          </SubmitButton>
        </div>
      </form>
    </dialog>
  )
}
