import type { ReactNode, Ref } from 'react'

// Phone only, so the bar's own rows can take it too; 56px plus its border, as on the boards.
export const phoneHeaderBarClass =
  'max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:z-10 max-md:box-border max-md:flex max-md:min-h-[calc(57px+env(safe-area-inset-top))] max-md:items-center max-md:gap-2 max-md:border-b max-md:border-divider max-md:bg-nav max-md:pt-[calc(6px+env(safe-area-inset-top))] max-md:pr-[max(12px,env(safe-area-inset-right))] max-md:pb-1.5 max-md:backdrop-blur-[24px] max-md:backdrop-saturate-[1.8] max-md:glass'

// One title and one of each action across widths: the phone's bar holds them, and from a tablet up it is display: contents.
export function PageHeader({
  title,
  titleRef,
  titleTabIndex,
  actions,
  className,
  children,
  controls,
}: {
  title: ReactNode
  titleRef?: Ref<HTMLHeadingElement>
  // -1 lets a page move focus here.
  titleTabIndex?: number
  actions?: ReactNode
  // The header's layout from a tablet up, where the title takes the first column's second row.
  className?: string
  // The line under the title on a phone, above it from a tablet up: a month, an email, counts.
  children?: ReactNode
  // After the title in reading order, wherever the layout places them.
  controls?: ReactNode
}) {
  return (
    <header className={className}>
      {children}
      <div
        className={`${phoneHeaderBarClass} max-md:pl-[max(16px,env(safe-area-inset-left))] md:contents`}
      >
        {/* Foundations' title type, 40 from a tablet up and 22 in the phone's bar. */}
        <h1
          ref={titleRef}
          tabIndex={titleTabIndex}
          className="m-0 min-w-0 text-[22px] leading-[1.2] font-bold tracking-[-0.014em] max-md:flex-auto md:col-start-1 md:row-start-2 md:text-[40px] md:leading-[1.08] md:tracking-[-0.024em]"
        >
          {title}
        </h1>
        {actions}
      </div>
      {controls}
    </header>
  )
}
