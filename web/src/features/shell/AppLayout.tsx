import { Outlet } from 'react-router'
import { PhoneTabBar } from '@/features/shell/PhoneTabBar'
import { TopBar } from '@/features/shell/TopBar'

export function AppLayout() {
  return (
    <>
      <TopBar />
      {/* On a phone the bottom padding clears the fixed tab bar and the home indicator. */}
      <main className="mx-auto box-border flex max-w-[1200px] flex-col gap-6 px-4 pt-10 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-6 md:pb-16 lg:px-8">
        <Outlet />
      </main>
      <PhoneTabBar />
    </>
  )
}
