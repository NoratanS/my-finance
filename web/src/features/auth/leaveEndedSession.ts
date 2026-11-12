import type { QueryClient } from '@tanstack/react-query'

type Navigate = (to: string, options: { replace: true }) => void | Promise<void>

export async function leaveEndedSession(
  navigate: Navigate,
  queryClient: QueryClient,
) {
  // Leave the signed-in screens first, so nothing refetches what clear() drops.
  await navigate('/sign-in', { replace: true })
  queryClient.clear()
}
