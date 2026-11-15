import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState, type RefObject } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { ApiError, isUnreachable } from '@/api/client'
import type { components } from '@/api/schema'
import {
  ghostButtonClass,
  primaryButtonClass,
} from '@/components/ui/buttonStyles'
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
import { nameLimit, tagName } from '@/features/tags/tagName'
import { useEditTag } from '@/features/tags/useEditTag'
import { countOf } from '@/lib/countOf'

type Tag = components['schemas']['Tag']

const renameSchema = z.object({ name: tagName('Name the tag.') })

// A taken name is another of my tags: the dialog offers to merge into it instead (StatesMerge board).
export function RenameTagDialog({
  ref,
  tag,
  tags,
  transactionCount,
  onMergeInto,
}: {
  ref: RefObject<HTMLDialogElement | null>
  tag: Tag
  tags: Tag[]
  transactionCount: number
  onMergeInto: (target: Tag) => void
}) {
  const editTag = useEditTag(tag.id)
  const form = useForm<
    z.input<typeof renameSchema>,
    unknown,
    z.output<typeof renameSchema>
  >({
    resolver: zodResolver(renameSchema),
    mode: 'onTouched',
    defaultValues: { name: tag.name },
  })
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = form
  const refusal = useFormRefusal(form, ['name'], {
    error: editTag.error,
    says: { 404: 'This tag was deleted elsewhere.' },
  })
  // The tag holding the name; the offer lasts while the field still shows it is taken.
  const [taken, setTaken] = useState<Tag>()
  const offer = errors.name?.type === 'taken' ? taken : undefined
  const typed = useWatch({ control, name: 'name' })
  const titleId = useId()
  const nameId = useId()

  const close = () => {
    ref.current?.close()
  }
  const saving = editTag.isPending
  const onSubmit = ({ name }: z.output<typeof renameSchema>) => {
    if (saving) return
    editTag.mutate(
      { name },
      {
        onSuccess: close,
        onError: (error) => {
          const existingId =
            error instanceof ApiError &&
            error.problem?.type === 'tag-name-taken'
              ? error.problem.existing_id
              : undefined
          const existing = tags.find(
            (other) => other.id === existingId && other.id !== tag.id,
          )
          if (!existing) {
            refusal.onError(error)
            return
          }
          setTaken(existing)
          setError(
            'name',
            {
              type: 'taken',
              message: `A tag named “${existing.name}” already exists.`,
            },
            { shouldFocus: true },
          )
        },
      },
    )
  }
  const submit = () => void handleSubmit(onSubmit)()
  // Nothing typed is wrong, so the dialog stays open with it for another try.
  const saveFailed = editTag.error !== null && isUnreachable(editTag.error)

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
          Rename tag
        </h2>
        {saveFailed ? (
          <RetryAlert onRetry={submit}>Couldn’t rename the tag.</RetryAlert>
        ) : (
          offer === undefined && refusal.banner
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
          <div className="flex justify-between gap-3">
            {errors.name ? (
              <div id={`${nameId}-error`} className={errorClass}>
                {errors.name.message}
              </div>
            ) : (
              <span id={`${nameId}-hint`} className={hintClass}>
                Its {countOf(transactionCount, 'transaction')} show the new
                name.
              </span>
            )}
            <span aria-hidden="true" className={`${hintClass} tabular-nums`}>
              {Array.from(typed).length} / {nameLimit}
            </span>
          </div>
        </div>
        {offer && (
          <p className={`m-0 ${hintClass}`}>
            You can merge {tag.name} into it instead: its{' '}
            {countOf(transactionCount, 'transaction')} will carry {offer.name}.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button type="button" onClick={close} className={ghostButtonClass}>
            Cancel
          </button>
          {offer ? (
            <button
              type="button"
              onClick={() => {
                onMergeInto(offer)
              }}
              className={`${primaryButtonClass} min-h-11 px-[18px] text-sm`}
            >
              Merge into {offer.name}…
            </button>
          ) : (
            <SubmitButton
              pending={saving}
              pendingLabel="Saving…"
              className="min-h-11 px-[18px] text-sm"
            >
              Save name
            </SubmitButton>
          )}
        </div>
      </form>
    </dialog>
  )
}
