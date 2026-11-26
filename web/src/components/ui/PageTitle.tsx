import type { ReactNode, Ref } from 'react'

// Title type from Foundations: 40 / 1.08 / −0.024em / 700.
export function PageTitle({
  id,
  ref,
  tabIndex,
  children,
}: {
  id?: string
  ref?: Ref<HTMLHeadingElement>
  // -1 lets a page move focus here.
  tabIndex?: number
  children: ReactNode
}) {
  return (
    <h1
      id={id}
      ref={ref}
      tabIndex={tabIndex}
      className="m-0 text-[40px] leading-[1.08] font-bold tracking-[-0.024em]"
    >
      {children}
    </h1>
  )
}
