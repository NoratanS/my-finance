import type { ComponentProps, ReactNode } from 'react'
import { primaryButtonClass } from '@/components/ui/buttonStyles'

type Props = {
  pending: boolean
  pendingLabel: string
  children: ReactNode
} & Omit<ComponentProps<'button'>, 'type' | 'aria-disabled'>

// The boards' primary submit: a spinner and pendingLabel while saving; disabled greys it out.
export function SubmitButton({
  pending,
  pendingLabel,
  children,
  className = '',
  ...button
}: Props) {
  return (
    <button
      type="submit"
      aria-disabled={pending}
      className={`${primaryButtonClass} min-h-12 disabled:cursor-not-allowed disabled:bg-white/8 disabled:text-text-muted aria-disabled:cursor-progress ${className}`}
      {...button}
    >
      {pending ? (
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
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  )
}
