import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import { useActiveProfileId } from './auth';
import type { CategoryNode, CreateCategoryRequest, UpdateCategoryRequest } from '../types';

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

/**
 * Everything a rename/re-parent/delete can leave stale: the tree itself, the
 * per-category counts and totals (raw rows are keyed by categoryId and don't
 * change, but the name/parent they join against does), and budgets/
 * subscriptions/subscription-dashboard, which embed a `{id, name}` category
 * snapshot in their own responses rather than resolving it from the tree.
 */
function useInvalidateCategoryData() {
  const queryClient = useQueryClient();
  const profileId = useActiveProfileId();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['categories', profileId] });
    queryClient.invalidateQueries({ queryKey: ['category-counts', profileId] });
    queryClient.invalidateQueries({ queryKey: ['category-totals', profileId] });
    queryClient.invalidateQueries({ queryKey: ['budgets', profileId] });
    queryClient.invalidateQueries({ queryKey: ['budget-status', profileId] });
    queryClient.invalidateQueries({ queryKey: ['subscriptions', profileId] });
    queryClient.invalidateQueries({ queryKey: ['subscription-dashboard', profileId] });
  };
}

/** PATCH /api/categories/{id} — absent fields stay untouched; `color: null` clears. */
export function useUpdateCategory() {
  const invalidate = useInvalidateCategoryData();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateCategoryRequest }) =>
      api<CategoryNode>(`/api/categories/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
}

/** DELETE /api/categories/{id} — 409 /errors/category-in-use when it has children, transactions, budgets or subscriptions. */
export function useDeleteCategory() {
  const invalidate = useInvalidateCategoryData();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/categories/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
