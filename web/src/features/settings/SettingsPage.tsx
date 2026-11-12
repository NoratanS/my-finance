import { useSuspenseQuery } from '@tanstack/react-query'
import { PageTitle } from '@/components/ui/PageTitle'
import { sessionQueries } from '@/features/auth/sessionQueries'
import { AdminSection } from '@/features/settings/AdminSection'

export function SettingsPage() {
  const { data: session } = useSuspenseQuery(sessionQueries.current())
  return (
    <>
      <header className="flex flex-col gap-1">
        <div className="text-[13px] font-semibold tracking-[0.01em] text-text-muted">
          {session.email}
        </div>
        <PageTitle>Settings</PageTitle>
      </header>
      <div className="flex max-w-[760px] flex-col gap-6">
        {/* TODO #12: the Ledger and Password sections replace this line. */}
        <p className="m-0 text-text-muted">
          Changing your currency and password is coming soon.
        </p>
        {session.admin && <AdminSection />}
      </div>
    </>
  )
}
