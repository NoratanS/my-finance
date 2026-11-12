import type { ReactNode } from 'react'

export type NavItem = {
  to: string
  label: string
  // Where the page sits on a phone: a tab of its own, or a row in the More sheet.
  phone: 'tab' | 'more'
  icon: ReactNode
}

const icon = (shapes: ReactNode) => (
  <svg
    aria-hidden="true"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="flex-none"
  >
    {shapes}
  </svg>
)

// Every page of the app, in the top bar's order. `live` turns true as a page's slice ships.
const pages: (NavItem & { live: boolean })[] = [
  {
    to: '/',
    label: 'Dashboard',
    phone: 'tab',
    live: true,
    icon: icon(
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.75" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.75" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.75" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.75" />
      </>,
    ),
  },
  {
    to: '/transactions',
    label: 'Transactions',
    phone: 'tab',
    live: false,
    icon: icon(
      <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
    ),
  },
  {
    to: '/tags',
    label: 'Tags',
    phone: 'more',
    live: false,
    icon: icon(
      <>
        <path d="M3.5 12V4.5a1 1 0 0 1 1-1H12a1 1 0 0 1 .7.3l7.8 7.8a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-7.8-7.8a1 1 0 0 1-.3-.7Z" />
        <path d="M8 8h.01" />
      </>,
    ),
  },
  {
    to: '/budgets',
    label: 'Budgets',
    phone: 'tab',
    live: false,
    icon: icon(
      <>
        <path d="M4 16.5a8 8 0 1 1 16 0" />
        <path d="M12 16.5l3.5-4.5" />
        <path d="M4 20h16" />
      </>,
    ),
  },
  {
    to: '/subscriptions',
    label: 'Subscriptions',
    phone: 'more',
    live: false,
    icon: icon(
      <>
        <path d="M4.5 10a7.5 7.5 0 0 1 13-3.5L19.5 8.5" />
        <path d="M19.5 4v4.5H15" />
        <path d="M19.5 14a7.5 7.5 0 0 1-13 3.5L4.5 15.5" />
        <path d="M4.5 20v-4.5H9" />
      </>,
    ),
  },
  {
    to: '/insights',
    label: 'Insights',
    phone: 'more',
    live: false,
    icon: icon(<path d="M5 20v-7M12 20V4.5M19 20v-4.5" />),
  },
]

// A link shows only once its page exists.
export const navItems: NavItem[] = pages.filter((page) => page.live)
