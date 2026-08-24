// React Query hooks, one per resource. Profile-scoped query keys embed the
// active profile id, so switching profiles naturally lands on a fresh cache
// (and switching back re-uses the old one until it refetches).

import {
  useMutation,
  useQuery,
  useQueryClient,
  useQueries,
} from '@tanstack/react-query';
import { api, ApiError, queryString } from './client';
import type {
  ActiveProfileResponse,
  BudgetResponse,
  BudgetStatusResponse,
  CategoryNode,
  CreateCategoryRequest,
  CreateProfileRequest,
  CreateSubscriptionRequest,
  CreateTransactionRequest,
  LoginRequest,
  Page,
  ProfileResponse,
  RegisterRequest,
  SessionResponse,
  SubscriptionDashboardResponse,
  SubscriptionResponse,
  SubscriptionStatus,
  TransactionQuery,
  TransactionResponse,
  UpdateSubscriptionRequest,
  UserResponse,
} from './types';

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

// — Profiles —

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => api<ProfileResponse[]>('/api/profiles'),
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProfileRequest) =>
      api<ProfileResponse>('/api/profiles', { method: 'POST', body }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      // The session payload carries the profile list the picker renders.
      queryClient.setQueryData<SessionResponse | null>(sessionKey, (old) =>
        old
          ? {
              ...old,
              profiles: [
                ...old.profiles,
                { id: created.id, name: created.name, defaultCurrency: created.defaultCurrency },
              ],
            }
          : old,
      );
    },
  });
}

// — Categories —

export function useCategories() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['categories', profileId],
    queryFn: () => api<CategoryNode[]>('/api/categories'),
    enabled: profileId !== null,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  const profileId = useActiveProfileId();
  return useMutation({
    mutationFn: (body: CreateCategoryRequest) =>
      api<CategoryNode>('/api/categories', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', profileId] });
    },
  });
}

// — Transactions —

export function useTransactions(query: TransactionQuery) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['transactions', profileId, query],
    queryFn: () =>
      api<Page<TransactionResponse>>(
        `/api/transactions${queryString({
          from: query.from,
          to: query.to,
          categoryId: query.categoryId,
          includeDescendants: query.includeDescendants,
          type: query.type,
          page: query.page,
          size: query.size,
        })}`,
      ),
    enabled: profileId !== null,
    placeholderData: (previous) => previous,
  });
}

/** Everything a transaction changes: lists, budget spend, subscription charges. */
function useInvalidateTransactionData() {
  const queryClient = useQueryClient();
  const profileId = useActiveProfileId();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['transactions', profileId] });
    queryClient.invalidateQueries({ queryKey: ['budgets', profileId] });
    queryClient.invalidateQueries({ queryKey: ['budget-status', profileId] });
    queryClient.invalidateQueries({ queryKey: ['subscription-dashboard', profileId] });
  };
}

export function useCreateTransaction() {
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: (body: CreateTransactionRequest) =>
      api<TransactionResponse>('/api/transactions', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/transactions/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

// — Budgets —

export function useBudgets(activeOn?: string) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['budgets', profileId, activeOn ?? 'all'],
    queryFn: () => api<BudgetResponse[]>(`/api/budgets${queryString({ activeOn })}`),
    enabled: profileId !== null,
  });
}

/** One GET /api/budgets/{id}/status per budget — fine at this scale. */
export function useBudgetStatuses(budgets: BudgetResponse[] | undefined) {
  const profileId = useActiveProfileId();
  return useQueries({
    queries: (budgets ?? []).map((budget) => ({
      queryKey: ['budget-status', profileId, budget.id],
      queryFn: () => api<BudgetStatusResponse>(`/api/budgets/${budget.id}/status`),
      enabled: profileId !== null,
    })),
  });
}

// — Subscriptions —

export function useSubscriptions(status?: SubscriptionStatus) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['subscriptions', profileId, status ?? 'current'],
    queryFn: () => api<SubscriptionResponse[]>(`/api/subscriptions${queryString({ status })}`),
    enabled: profileId !== null,
  });
}

export function useSubscriptionDashboard() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['subscription-dashboard', profileId],
    queryFn: () => api<SubscriptionDashboardResponse>('/api/subscriptions/dashboard'),
    enabled: profileId !== null,
  });
}

function useInvalidateSubscriptions() {
  const queryClient = useQueryClient();
  const profileId = useActiveProfileId();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['subscriptions', profileId] });
    queryClient.invalidateQueries({ queryKey: ['subscription-dashboard', profileId] });
  };
}

export function useCreateSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: (body: CreateSubscriptionRequest) =>
      api<SubscriptionResponse>('/api/subscriptions', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateSubscriptionRequest }) =>
      api<SubscriptionResponse>(`/api/subscriptions/${id}`, { method: 'PUT', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteSubscription() {
  const invalidate = useInvalidateSubscriptions();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/subscriptions/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
