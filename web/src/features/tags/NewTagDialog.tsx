import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useRef, type RefObject } from 'react'
import { useForm, useWatch } from 'react-hook-form'
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
import { useModal } from '@/components/ui/useModal'
import { ColourPicker } from '@/features/tags/ColourPicker'
import { GroupDialog } from '@/features/tags/GroupDialog'
import { tagColours, type TagColour } from '@/features/tags/tagColours'
import { tagName } from '@/features/tags/tagName'
import { useCreateTag } from '@/features/tags/useCreateTag'

type TagInput = components['schemas']['TagInput']
type TagGroup = components['schemas']['TagGroup']

// The Group select's last option opens New group instead of picking one.
const newGroupOption = 'new'

// A tag's rules, checked before saving.
const tagSchema = z.object({
  name: tagName('Name the tag.'),
  colour: z
    .enum(Object.keys(tagColours) as [TagColour, ...TagColour[]])
    .nullable(),
  group_id: z.number().nullable(),
}) satisfies z.ZodType<TagInput>

// A native modal <dialog>, like TransactionDialog: showModal() gives the focus trap, Escape and focus return.
export function NewTagDialog({
  ref,
  groups,
}: {
  ref: RefObject<HTMLDialogElement | null>
  // A–Z, as the tags list sends them.
  groups: TagGroup[]
}) {
  const createTag = useCreateTag()
  const form = useForm<
    z.input<typeof tagSchema>,
    unknown,
    z.output<typeof tagSchema>
  >({
    resolver: zodResolver(tagSchema),
    mode: 'onTouched',
    defaultValues: { name: '', colour: null, group_id: null },
  })
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = form
  const refusal = useFormRefusal(form, ['name', 'colour', 'group_id'], {
    error: createTag.error,
  })
  const colour = useWatch({ control, name: 'colour' })
  const groupId = useWatch({ control, name: 'group_id' })
  const titleId = useId()
  const fieldId = useId()
  const nameId = `${fieldId}-name`
  const colourId = `${fieldId}-colour`
  const groupFieldId = `${fieldId}-group`
  const newGroupRef = useRef<HTMLDialogElement>(null)
  // Its own key, so a fresh New group form leaves what's typed here.
  const newGroup = useModal(newGroupRef)

  const close = () => {
    ref.current?.close()
  }
  const saving = createTag.isPending
  const onSubmit = (tag: z.output<typeof tagSchema>) => {
    if (saving) return
    createTag.mutate(tag, { onSuccess: close, onError: refusal.onError })
  }
  const submit = () => void handleSubmit(onSubmit)()
  // Nothing typed is wrong, so the dialog stays open with it for another try.
  const saveFailed = createTag.error !== null && isUnreachable(createTag.error)

  return (
    <>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className={`${dialogClass} w-[min(480px,calc(100%-2rem))] p-0`}
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
            New tag
          </h2>
          {saveFailed ? (
            <RetryAlert onRetry={submit}>Couldn’t create the tag.</RetryAlert>
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
                Letter case doesn’t matter: “cinema” and “Cinema” are one tag.
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span id={colourId} className={labelClass}>
              Colour <span className="font-normal">· optional</span>
            </span>
            <ColourPicker
              labelledBy={colourId}
              value={colour}
              onChange={(picked) => {
                setValue('colour', picked)
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={groupFieldId} className={labelClass}>
              Group <span className="font-normal">· optional</span>
            </label>
            {/* Controlled: picking New group… leaves the last group shown until the new one is created. */}
            <select
              id={groupFieldId}
              disabled={saving}
              value={groupId === null ? '' : String(groupId)}
              onChange={(event) => {
                const picked = event.target.value
                if (picked === newGroupOption) newGroup.open()
                else setValue('group_id', picked === '' ? null : Number(picked))
              }}
              className={`${fieldClass} disabled:text-text-muted`}
            >
              <option value="">No group</option>
              {groups.map((group) => (
                <option key={group.id} value={String(group.id)}>
                  {group.name}
                </option>
              ))}
              <option value={newGroupOption}>New group…</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button type="button" onClick={close} className={ghostButtonClass}>
              Cancel
            </button>
            <SubmitButton
              pending={saving}
              pendingLabel="Creating…"
              className="min-h-11 px-[18px] text-sm"
            >
              Create tag
            </SubmitButton>
          </div>
        </form>
      </dialog>
      {/* Beside the dialog, not in it: a form can't hold another form. */}
      <GroupDialog
        key={newGroup.key}
        ref={newGroupRef}
        onSaved={(group) => {
          setValue('group_id', group.id)
        }}
      />
    </>
  )
}
