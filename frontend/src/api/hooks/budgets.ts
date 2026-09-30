import { useMutation, useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { api, queryString } from '../client';
import { useActiveProfileId } from './auth';
import type { BudgetResponse, BudgetStatusResponse, BudgetRequest } from '../types';

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
    mutationFn: (body: BudgetRequest) =>
      api<BudgetResponse>('/api/budgets', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

/** PUT /api/budgets/{id} — full replacement, same body shape as POST. */
export function useUpdateBudget() {
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: BudgetRequest }) =>
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
