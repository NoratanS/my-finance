import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, queryString } from '../client';
import { useActiveProfileId } from './auth';
import type {
  CategoryTotal,
  CategoryTransactionCount,
  CreateTransactionRequest,
  MerchantBackfillRequest,
  MerchantBackfillResponse,
  MerchantSuggestion,
  Page,
  TransactionQuery,
  TransactionResponse,
  TransactionSummaryRow,
} from '../types';

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
          q: query.q,
          page: query.page,
          size: query.size,
        })}`,
      ),
    enabled: profileId !== null,
    placeholderData: (previous) => previous,
  });
}

/**
 * GET /api/transactions/summary — income/expense/net/count per currency over every row the
 * same filters match. Screens must use this for money tiles: summing `useTransactions`
 * content only ever sums one page.
 */
export function useTransactionSummary(query: TransactionQuery) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['transaction-summary', profileId, query],
    queryFn: () =>
      api<TransactionSummaryRow[]>(
        `/api/transactions/summary${queryString({
          from: query.from,
          to: query.to,
          categoryId: query.categoryId,
          includeDescendants: query.includeDescendants,
          type: query.type,
          q: query.q,
        })}`,
      ),
    enabled: profileId !== null,
    placeholderData: (previous) => previous,
  });
}

/**
 * GET /api/transactions/category-counts — every transaction of the profile, counted as filed.
 * `q` is the only filter it takes; callers that don't search omit it and get the whole profile.
 */
export function useCategoryCounts(q?: string) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['category-counts', profileId, q],
    queryFn: () =>
      api<CategoryTransactionCount[]>(`/api/transactions/category-counts${queryString({ q })}`),
    enabled: profileId !== null,
  });
}

/** GET /api/transactions/category-totals — summed amounts per category and currency. */
export function useCategoryTotals(query: TransactionQuery) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['category-totals', profileId, query],
    queryFn: () =>
      api<CategoryTotal[]>(
        `/api/transactions/category-totals${queryString({
          from: query.from,
          to: query.to,
          categoryId: query.categoryId,
          includeDescendants: query.includeDescendants,
          type: query.type,
          q: query.q,
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
    queryClient.invalidateQueries({ queryKey: ['transaction-summary', profileId] });
    queryClient.invalidateQueries({ queryKey: ['category-counts', profileId] });
    queryClient.invalidateQueries({ queryKey: ['category-totals', profileId] });
    queryClient.invalidateQueries({ queryKey: ['budgets', profileId] });
    queryClient.invalidateQueries({ queryKey: ['budget-status', profileId] });
    queryClient.invalidateQueries({ queryKey: ['subscription-dashboard', profileId] });
    queryClient.invalidateQueries({ queryKey: ['merchant-suggestions', profileId] });
    // Pinned Dashboard tiles re-execute a saved plan against live transaction data
    // (PinnedInsights.tsx -> useInsightResults) — without this, a create/edit/delete
    // leaves a pinned tile showing a now-wrong number until something else happens to
    // invalidate it (mirrors useInvalidateInsights' own 'insight-result' line in insights.ts).
    queryClient.invalidateQueries({ queryKey: ['insight-result', profileId] });
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

/** PUT /api/transactions/{id} — full replacement, same body shape as POST. */
export function useUpdateTransaction() {
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: CreateTransactionRequest }) =>
      api<TransactionResponse>(`/api/transactions/${id}`, { method: 'PUT', body }),
    onSuccess: invalidate,
  });
}

export function useMerchantSuggestions() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['merchant-suggestions', profileId],
    queryFn: () => api<MerchantSuggestion[]>('/api/transactions/merchant-suggestions'),
    enabled: profileId !== null,
  });
}

export function useBackfillMerchant() {
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: (body: MerchantBackfillRequest) =>
      api<MerchantBackfillResponse>('/api/transactions/merchant-backfill', {
        method: 'POST',
        body,
      }),
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
