import type { ReactNode } from 'react'

// Title type from Foundations: 40 / 1.08 / −0.024em / 700.
export function PageTitle({
  id,
  children,
}: {
  id?: string
  children: ReactNode
}) {
  return (
    <h1
      id={id}
      className="m-0 text-[40px] leading-[1.08] font-bold tracking-[-0.024em]"
    >
      {children}
    </h1>
  )
}
