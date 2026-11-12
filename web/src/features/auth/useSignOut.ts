import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api, call, isUnauthorized } from '@/api/client'
import { leaveEndedSession } from '@/features/auth/leaveEndedSession'

export function useSignOut() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async () => {
      try {
        await call(api.DELETE('/api/session'))
      } catch (error) {
        // A 401 means the session already ended, which is what signing out wants.
        if (!isUnauthorized(error)) throw error
      }
    },
    onSuccess: () => leaveEndedSession(navigate, queryClient),
  })
}
