import { Outlet } from 'react-router'
import { PhoneTabBar } from '@/features/shell/PhoneTabBar'
import { TopBar } from '@/features/shell/TopBar'

export function AppLayout() {
  return (
    <>
      <TopBar />
      {/* On a phone the padding clears the fixed tab bar, the home indicator and the notch. */}
      <main className="mx-auto box-border flex max-w-[1200px] flex-col gap-6 pt-10 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(6rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] md:px-6 md:pb-16 lg:px-8">
        <Outlet />
      </main>
      <PhoneTabBar />
    </>
  )
}
