// The attempt-limit refusal (a 429) on a credential form.
export function RateLimitNotice() {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl bg-over/12 px-3.5 py-3 text-sm font-medium text-over"
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
        strokeLinejoin="round"
        className="mt-0.5 flex-none"
      >
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 4.75V8l2.25 1.5" />
      </svg>
      <span>Too many attempts. Try again in a few minutes.</span>
    </div>
  )
}
