import { Link } from 'react-router'
import { Menu, menuItemProps } from '@/components/ui/Menu'
import { SignedInAs, SignOutButton } from '@/features/shell/Account'

const itemClass =
  'flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-3 text-left text-sm text-text no-underline hover:bg-white/10 hover:text-text focus-visible:outline-offset-[-2px] disabled:cursor-progress disabled:text-text-muted'

export function UserMenu({ email }: { email: string }) {
  return (
    <Menu
      label="Account"
      triggerLabel={`${email}, account menu`}
      triggerClassName="group box-border inline-flex min-h-11 max-w-60 press cursor-pointer items-center gap-2 rounded-full border border-divider bg-white/6 py-0 pr-3.5 pl-2 text-sm text-text aria-expanded:border-white/18 aria-expanded:bg-white/12 md:max-lg:max-w-[140px]"
      trigger={
        <>
          <span
            aria-hidden="true"
            className="inline-flex size-7 flex-none items-center justify-center rounded-full bg-surface-2 text-[13px] font-[650]"
          >
            {email.charAt(0).toUpperCase()}
          </span>
          <span className="truncate font-semibold">{email}</span>
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="flex-none group-aria-expanded:rotate-180"
          >
            <path d="M3 4.5 6 7.5 9 4.5" />
          </svg>
        </>
      }
      panelClassName="absolute top-[calc(100%+8px)] right-0 z-20 box-border flex w-[264px] origin-top-right flex-col rounded-2xl border border-white/14 bg-menu p-1.5 text-sm shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-[30px] backdrop-saturate-[1.8] glass-menu"
      header={
        <div className="mb-1.5 flex border-b border-divider px-3 pt-2.5 pb-3">
          <SignedInAs email={email} />
        </div>
      }
    >
      {(close) => (
        <>
          <Link
            {...menuItemProps}
            to="/settings"
            onClick={close}
            className={itemClass}
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
            >
              <path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7" />
              <circle cx="11" cy="4.5" r="1.5" />
              <circle cx="5" cy="11.5" r="1.5" />
            </svg>
            Settings
          </Link>
          <SignOutButton inMenu className={itemClass} />
        </>
      )}
    </Menu>
  )
}
