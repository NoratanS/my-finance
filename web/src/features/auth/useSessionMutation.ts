import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import type { components } from '@/api/schema'
import { sessionQueries } from '@/features/auth/sessionQueries'

type Session = components['schemas']['Session']
type Problem = components['schemas']['Problem']
type Answer = { data?: Session; error?: Problem; response: Response }

declare module '@tanstack/react-query' {
  interface Register {
    // signsIn: a 401 means wrong credentials, not an ended session.
    mutationMeta: { signsIn?: true }
  }
}

// A call that answers with the signed-in user (sign in, signup, reset, settings), which becomes the cached session.
export function useSessionMutation<Variables>(
  send: (variables: Variables) => Promise<Answer>,
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
    mutationFn: async (variables: Variables) => {
      const { data, error, response } = await send(variables)
      if (!data) throw new ApiError(response.status, error)
      return data
    },
    onSuccess: (session) => {
      queryClient.setQueryData(sessionQueries.current().queryKey, session)
    },
    onError,
    meta: signsIn && { signsIn },
  })
}
