import type { ReactNode } from 'react'

// The boards' danger notice: tinted panel, icon, one short sentence.
export function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl bg-danger/12 px-3.5 py-3 text-sm font-medium text-danger"
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="mt-0.5 flex-none"
      >
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 4.75v3.75M8 11v.1" />
      </svg>
      <span>{children}</span>
    </div>
  )
}
