import { Outlet } from 'react-router'
import { TopBar } from '@/features/shell/TopBar'

export function AppLayout() {
  return (
    <>
      <TopBar />
      <main className="mx-auto box-border flex max-w-[1200px] flex-col gap-6 px-8 pt-10 pb-16">
        <Outlet />
      </main>
    </>
  )
}
