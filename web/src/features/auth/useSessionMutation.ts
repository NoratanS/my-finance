import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { components } from '@/api/schema'
import { sessionQueries } from '@/features/auth/sessionQueries'

type Session = components['schemas']['Session']

declare module '@tanstack/react-query' {
  interface Register {
    // signsIn: a 401 means wrong credentials, not an ended session.
    mutationMeta: { signsIn?: true }
  }
}

// A call that answers with the signed-in user (sign in, signup, reset, settings), which becomes the cached session.
export function useSessionMutation<Variables>(
  send: (variables: Variables) => Promise<Session>,
  {
    onError,
    signsIn,
  }: {
    onError?: (error: Error, variables: Variables) => void
    signsIn?: true
  } = {},
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: send,
    onSuccess: (session) => {
      queryClient.setQueryData(sessionQueries.current().queryKey, session)
    },
    onError,
    meta: signsIn && { signsIn },
  })
}
