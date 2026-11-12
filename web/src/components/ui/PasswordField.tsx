import { type ComponentProps, useId, useState } from 'react'
import {
  errorClass,
  fieldClass,
  hintClass,
  labelClass,
} from '@/components/ui/fieldStyles'

type Props = {
  label: string
  hint?: string
  error: string | undefined
} & Omit<ComponentProps<'input'>, 'id' | 'type'>

// A password field with Show, which hides while the form is busy (read-only). New password unless autoComplete says otherwise.
export function PasswordField({ label, hint, error, ...input }: Props) {
  const id = useId()
  const [shown, setShown] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete="new-password"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-hint` : undefined}
          className={`${fieldClass} pr-[72px]`}
          {...input}
        />
        {!input.readOnly && (
          <button
            type="button"
            aria-label={`Show ${label.toLowerCase()}`}
            aria-controls={id}
            aria-pressed={shown}
            onClick={() => {
              setShown((isShown) => !isShown)
            }}
            className="absolute top-0 right-0.5 min-h-11 cursor-pointer rounded-[10px] border-0 bg-transparent px-3 text-sm font-semibold text-accent"
          >
            Show
          </button>
        )}
      </div>
      {(error ?? hint) && (
        <div id={`${id}-hint`} className={error ? errorClass : hintClass}>
          {error ?? hint}
        </div>
      )}
    </div>
  )
}
