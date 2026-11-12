import { useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { MoreSheet } from '@/features/shell/MoreSheet'
import { navItems } from '@/features/shell/navItems'

const tabClass =
  'flex min-h-13 cursor-pointer flex-col items-center justify-center gap-[3px] border-0 bg-transparent p-0 text-[11px] leading-[1.1] font-medium tracking-[0.01em] text-text-muted no-underline focus-visible:rounded-xl focus-visible:outline-offset-[-2px] aria-[current=page]:font-[650] aria-[current=page]:text-accent'

// Phone only (below md); its own name, since the top bar's "Main" nav stays in the DOM.
export function PhoneTabBar() {
  const sheetRef = useRef<HTMLDialogElement>(null)
  const { pathname } = useLocation()
  const [closes, setCloses] = useState(0)
  return (
    <>
      <nav
        aria-label="Tab bar"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-divider bg-nav backdrop-blur-[24px] backdrop-saturate-[1.8] glass md:hidden"
      >
        <div className="grid auto-cols-fr grid-flow-col pt-1 pr-[max(4px,env(safe-area-inset-right))] pb-[max(4px,env(safe-area-inset-bottom))] pl-[max(4px,env(safe-area-inset-left))]">
          {navItems
            .filter((item) => item.phoneSlot === 'tab')
            .map((item) => (
              <NavLink key={item.to} to={item.to} end className={tabClass}>
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => sheetRef.current?.showModal()}
            className={tabClass}
          >
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <circle cx="5.5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="18.5" cy="12" r="1.6" />
            </svg>
            More
          </button>
        </div>
      </nav>
      {/* Outside the nav, which md:hidden removes: an open sheet survives a resize.
          The key gives each opening a fresh sheet, and a page change unmounts an open one. */}
      <MoreSheet
        key={`${pathname}:${String(closes)}`}
        ref={sheetRef}
        onClose={() => {
          setCloses((count) => count + 1)
        }}
      />
    </>
  )
}
