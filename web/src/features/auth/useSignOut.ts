import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api, ApiError } from '@/api/client'
import { leaveEndedSession } from '@/features/auth/leaveEndedSession'

export function useSignOut() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async () => {
      const { response } = await api.DELETE('/api/session')
      // A 401 means the session already ended, which is what signing out wants.
      if (!response.ok && response.status !== 401) {
        throw new ApiError(response.status)
      }
    },
    onSuccess: () => leaveEndedSession(navigate, queryClient),
  })
}
