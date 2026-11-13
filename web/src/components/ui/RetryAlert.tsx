import type { ReactNode } from 'react'
import { ghostButtonClass } from '@/components/ui/buttonStyles'

// The boards' failed load or save: a short danger line with Try again beside it.
export function RetryAlert({
  children,
  onRetry,
}: {
  children: ReactNode
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
    >
      <span className="inline-flex items-center gap-2.5 text-sm font-medium text-danger">
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="flex-none"
        >
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 4.75v3.75M8 11v.1" />
        </svg>
        {children}
      </span>
      <button type="button" onClick={onRetry} className={ghostButtonClass}>
        Try again
      </button>
    </div>
  )
}
