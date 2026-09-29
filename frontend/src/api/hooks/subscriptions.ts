import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryString } from '../client';
import { useActiveProfileId } from './auth';
import type {
  CreateSubscriptionRequest,
  SubscriptionDashboardResponse,
  SubscriptionResponse,
  SubscriptionStatus,
  UpdateSubscriptionRequest,
} from '../types';

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
  const queryClient = useQueryClient();
  const profileId = useActiveProfileId();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/subscriptions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      // Deleting a subscription SET NULLs the subscriptionId on its posted
      // charges — cached transaction rows would keep showing the "sub" tag.
      queryClient.invalidateQueries({ queryKey: ['transactions', profileId] });
    },
  });
}
