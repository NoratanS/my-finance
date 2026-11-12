import type { ReactNode } from 'react'
import { Brand } from '@/components/ui/Brand'

// The boards' dead-link card (expired, used, invalid), which replaces a signed-out page's form.
export function StateCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <>
      <header className="flex justify-center">
        <Brand />
      </header>
      <section className="flex flex-col items-center gap-3 rounded-3xl bg-surface px-8 py-10 text-center">
        <span
          aria-hidden="true"
          className="inline-flex size-13 items-center justify-center rounded-full bg-surface-2 text-text-muted"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {icon}
          </svg>
        </span>
        <h1 className="m-0 text-[28px] leading-[1.14] font-bold tracking-[-0.018em]">
          {title}
        </h1>
        {children}
      </section>
    </>
  )
}
