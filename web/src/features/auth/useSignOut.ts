import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { api, ApiError } from '@/api/client'

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
    onSuccess: async () => {
      // Leave the signed-in screens first, so nothing refetches what clear() drops.
      await navigate('/sign-in', { replace: true })
      queryClient.clear()
    },
  })
}
