// React Query hooks, one per resource. Profile-scoped query keys embed the
// active profile id, so switching profiles naturally lands on a fresh cache
// (and switching back re-uses the old one until it refetches).

import {
  useMutation,
  useQuery,
  useQueryClient,
  useQueries,
} from '@tanstack/react-query';
import { useRef } from 'react';
import { api, queryString } from '../client';
import { useActiveProfileId } from './auth';
import type {
  AiCapabilities,
  BudgetResponse,
  BudgetStatusResponse,
  CreateBudgetRequest,
  CreateSubscriptionRequest,
  Insight,
  InsightRequest,
  InterpretRequest,
  InterpretResponse,
  NarrationResponse,
  Plan,
  ResultEnvelope,
  SubscriptionDashboardResponse,
  SubscriptionResponse,
  SubscriptionStatus,
  UpdateSubscriptionRequest,
} from '../types';

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

function useInvalidateBudgets() {
  const queryClient = useQueryClient();
  const profileId = useActiveProfileId();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['budgets', profileId] });
    queryClient.invalidateQueries({ queryKey: ['budget-status', profileId] });
  };
}

export function useCreateBudget() {
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: (body: CreateBudgetRequest) =>
      api<BudgetResponse>('/api/budgets', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

/** PUT /api/budgets/{id} — full replacement, same body shape as POST. */
export function useUpdateBudget() {
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: CreateBudgetRequest }) =>
      api<BudgetResponse>(`/api/budgets/${id}`, { method: 'PUT', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteBudget() {
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/budgets/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
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

// — Insights —

export function useInsights() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['insights', profileId],
    queryFn: () => api<Insight[]>('/api/insights'),
    enabled: profileId !== null,
  });
}

/** One saved insight — the explorer's ?insight=<id> deep link. */
export function useInsight(id: number) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['insight', profileId, id],
    queryFn: () => api<Insight>(`/api/insights/${id}`),
    // Callers pass 0 when nothing is open, so this stays a plain hook call.
    enabled: profileId !== null && id > 0,
  });
}

/** Saving, renaming, pinning or deleting all change the dashboard's tiles. */
function useInvalidateInsights() {
  const queryClient = useQueryClient();
  const profileId = useActiveProfileId();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['insights', profileId] });
    // Query keys match element by element, so 'insight' and 'insights' are
    // different caches: without this line a pin toggle leaves the open
    // insight stale and the next rename silently unpins it.
    queryClient.invalidateQueries({ queryKey: ['insight', profileId] });
    queryClient.invalidateQueries({ queryKey: ['insight-result', profileId] });
  };
}

export function useCreateInsight() {
  const invalidate = useInvalidateInsights();
  return useMutation({
    mutationFn: (body: InsightRequest) =>
      api<Insight>('/api/insights', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateInsight() {
  const invalidate = useInvalidateInsights();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: InsightRequest }) =>
      api<Insight>(`/api/insights/${id}`, { method: 'PUT', body }),
    onSuccess: invalidate,
  });
}

export function useDeleteInsight() {
  const invalidate = useInvalidateInsights();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/insights/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

/**
 * POST /api/insights/execute — the explorer's Run button. A mutation rather
 * than a query: the user triggers it deliberately, and an unsaved plan has no
 * identity worth caching under.
 */
export function useExecutePlan() {
  return useMutation({
    mutationFn: (plan: Plan) =>
      api<ResultEnvelope>('/api/insights/execute', { method: 'POST', body: plan }),
  });
}

/**
 * POST /api/insights/narrate. The backend re-executes the plan, so the caption
 * always describes this profile's real numbers; no invalidation, nothing is written.
 *
 * The backend's analytics read timeout is 130s (a slow local model, not a bug) and this
 * deliberately sets no client-side timeout to match — the point of `cancel` is a way for the
 * user to give up, not a shorter deadline that would recreate the same bug on the browser
 * side. A fresh `AbortController` per call, kept in a ref rather than mutation state, is the
 * plain way to reach an in-flight fetch: TanStack Query mutations don't expose one themselves.
 */
export function useNarrate() {
  const controllerRef = useRef<AbortController | null>(null);
  const mutation = useMutation({
    mutationFn: (plan: Plan) => {
      const controller = new AbortController();
      controllerRef.current = controller;
      return api<NarrationResponse>('/api/insights/narrate', {
        method: 'POST',
        body: plan,
        signal: controller.signal,
      });
    },
  });
  return { ...mutation, cancel: () => controllerRef.current?.abort() };
}

/**
 * One POST /api/insights/execute per insight — the dashboard's pinned tiles.
 * Same fan-out shape as useBudgetStatuses; fine at this scale (dozens at most).
 */
export function useInsightResults(insights: Insight[] | undefined) {
  const profileId = useActiveProfileId();
  return useQueries({
    queries: (insights ?? []).map((insight) => ({
      queryKey: ['insight-result', profileId, insight.id],
      queryFn: () =>
        api<ResultEnvelope>('/api/insights/execute', { method: 'POST', body: insight.plan }),
      enabled: profileId !== null,
    })),
  });
}

// — Insights (AI) —

/**
 * Is the optional local AI layer running? Instance-wide, so the key carries no
 * profile id (every other key here does) — and cached for five minutes, because
 * the answer only changes when someone restarts the stack with `--profile ai`.
 */
export function useAiCapabilities() {
  return useQuery({
    queryKey: ['ai-capabilities'],
    queryFn: () => api<AiCapabilities>('/api/insights/capabilities'),
    staleTime: 5 * 60_000,
  });
}

/**
 * POST /api/insights/interpret — the AI search box's and follow-up's only call. Nothing
 * cached changes. Same cancellable-not-timed-out shape as `useNarrate` above.
 */
export function useInterpret() {
  const controllerRef = useRef<AbortController | null>(null);
  const mutation = useMutation({
    mutationFn: (body: InterpretRequest) => {
      const controller = new AbortController();
      controllerRef.current = controller;
      return api<InterpretResponse>('/api/insights/interpret', {
        method: 'POST',
        body,
        signal: controller.signal,
      });
    },
  });
  return { ...mutation, cancel: () => controllerRef.current?.abort() };
}
