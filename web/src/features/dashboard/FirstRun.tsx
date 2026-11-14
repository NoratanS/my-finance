import { useId } from 'react'
import { Link } from 'react-router'
import { primaryButtonClass } from '@/components/ui/buttonStyles'

export function FirstRun({ currency }: { currency: string }) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="box-border flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-3xl bg-surface px-8 py-14 text-center"
    >
      <span
        aria-hidden="true"
        className="mb-2 inline-flex size-16 items-center justify-center rounded-full bg-surface-2 text-text-muted"
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
          <path d="M9 8h6M9 12h6" />
        </svg>
      </span>
      <h2
        id={titleId}
        className="m-0 text-[28px] leading-[1.14] font-[650] tracking-[-0.018em]"
      >
        Start with your first transaction
      </h2>
      <p className="m-0 max-w-[440px] text-text-muted">
        Add something you spent or earned. Your monthly net, budgets and
        insights all build from your transactions.
      </p>
      <button
        type="button"
        className={`${primaryButtonClass} mt-3 inline-flex min-h-12 items-center gap-2 px-6`}
      >
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M7 2v10M2 7h10" />
        </svg>
        Add transaction
      </button>
      <p className="mt-2 mb-0 text-[13px] text-text-muted">
        Amounts are in {currency}. You can change that in{' '}
        <Link to="/settings" className="font-semibold text-accent no-underline">
          settings
        </Link>{' '}
        until you add your first transaction.
      </p>
    </section>
  )
}
