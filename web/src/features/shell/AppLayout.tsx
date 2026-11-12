import { Outlet } from 'react-router'
import { TopBar } from '@/features/shell/TopBar'

export function AppLayout() {
  return (
    <>
      <TopBar />
      <Outlet />
    </>
  )
}
