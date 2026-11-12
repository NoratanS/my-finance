import type { QueryClient } from '@tanstack/react-query'
import { redirect } from 'react-router'
import { isUnauthorized } from '@/api/client'
import { sessionQueries } from '@/features/auth/sessionQueries'

// Route loader: the signed-in screens render only once the session is known.
export async function requireSession(queryClient: QueryClient) {
  try {
    await queryClient.query({
      ...sessionQueries.current(),
      staleTime: 'static',
    })
  } catch (error) {
    if (isUnauthorized(error)) return redirect('/sign-in')
    throw error
  }
  return null
}
