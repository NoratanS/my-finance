import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../client';
import type {
  ActiveProfileResponse,
  LoginRequest,
  RegisterRequest,
  SessionResponse,
  SetPasswordRequest,
  UserResponse,
} from '../types';

export const sessionKey = ['session'] as const;

/**
 * GET /api/auth/me — restores the session AND sets the XSRF-TOKEN cookie
 * (the CSRF bootstrap): it runs before any mutation is possible.
 * Resolves to null when unauthenticated instead of throwing.
 */
export function useSession() {
  return useQuery<SessionResponse | null>({
    queryKey: sessionKey,
    queryFn: async () => {
      try {
        return await api<SessionResponse>('/api/auth/me', { skipAuthEvent: true });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

/** Active profile id from the cached session, or null. */
export function useActiveProfileId(): number | null {
  const { data: session } = useSession();
  return session?.activeProfileId ?? null;
}

export function useActiveProfile() {
  const { data: session } = useSession();
  return session?.profiles.find((p) => p.id === session.activeProfileId) ?? null;
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: RegisterRequest) =>
      api<UserResponse>('/api/auth/register', { method: 'POST', body, skipAuthEvent: true }),
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      api<SessionResponse>('/api/auth/login', { method: 'POST', body, skipAuthEvent: true }),
    onSuccess: (session) => {
      queryClient.setQueryData(sessionKey, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/api/auth/logout', { method: 'POST', skipAuthEvent: true }),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(sessionKey, null);
    },
  });
}

/** PUT /api/auth/password — gives the passwordless local account a password for a later switch. */
export function useSetPassword() {
  return useMutation({
    mutationFn: (body: SetPasswordRequest) =>
      api<void>('/api/auth/password', { method: 'PUT', body }),
  });
}

export function useSetActiveProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profileId: number) =>
      api<ActiveProfileResponse>('/api/auth/active-profile', {
        method: 'PUT',
        body: { profileId },
      }),
    onSuccess: (result) => {
      queryClient.setQueryData<SessionResponse | null>(sessionKey, (old) =>
        old ? { ...old, activeProfileId: result.activeProfileId } : old,
      );
    },
  });
}
