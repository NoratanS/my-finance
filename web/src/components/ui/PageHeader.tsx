import type { ReactNode, Ref } from 'react'

// The boards' phone header bar: glass, 56px plus the notch, fixed at the top like the tab bar at the bottom.
// Phone only; callers add the left padding and what the bar holds.
export const phoneBarClass =
  'max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:z-10 max-md:box-border max-md:flex max-md:min-h-[calc(56px+env(safe-area-inset-top))] max-md:items-center max-md:gap-2 max-md:border-b max-md:border-divider max-md:bg-nav max-md:pt-[calc(6px+env(safe-area-inset-top))] max-md:pr-[max(12px,env(safe-area-inset-right))] max-md:pb-1.5 max-md:backdrop-blur-[24px] max-md:backdrop-saturate-[1.8] max-md:glass'

// A page's title and actions, each once: on a phone they make up the header bar; from a tablet up the bar steps
// aside (display: contents), so they sit in the page's own header layout, the title in its first column's second row.
export function PageHeader({
  title,
  titleRef,
  titleTabIndex,
  actions,
  className,
  children,
}: {
  title: ReactNode
  titleRef?: Ref<HTMLHeadingElement>
  // -1 lets a page move focus here.
  titleTabIndex?: number
  actions?: ReactNode
  // The header's layout from a tablet up.
  className?: string
  // The line under the title on a phone, above it from a tablet up: a month, an email, counts.
  children?: ReactNode
}) {
  return (
    <header className={className}>
      {children}
      <div
        className={`${phoneBarClass} max-md:pl-[max(16px,env(safe-area-inset-left))] md:contents`}
      >
        {/* Title type from Foundations: 40 / 1.08 / −0.024em / 700; the phone bar's 22 / 1.2 / −0.014em. */}
        <h1
          ref={titleRef}
          tabIndex={titleTabIndex}
          className="m-0 min-w-0 text-[22px] leading-[1.2] font-bold tracking-[-0.014em] max-md:flex-auto md:col-start-1 md:row-start-2 md:text-[40px] md:leading-[1.08] md:tracking-[-0.024em]"
        >
          {title}
        </h1>
        {actions}
      </div>
    </header>
  )
}
