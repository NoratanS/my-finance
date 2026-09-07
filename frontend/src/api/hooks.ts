// React Query hooks, one per resource. Profile-scoped query keys embed the
// active profile id, so switching profiles naturally lands on a fresh cache
// (and switching back re-uses the old one until it refetches).

import {
  useMutation,
  useQuery,
  useQueryClient,
  useQueries,
} from '@tanstack/react-query';
import { api, apiDownload, apiUpload, ApiError, queryString } from './client';
import type {
  ActiveProfileResponse,
  AiCapabilities,
  BackupExportRequest,
  BudgetResponse,
  BudgetStatusResponse,
  CategoryNode,
  CategoryTotal,
  CategoryTransactionCount,
  CreateBudgetRequest,
  CreateCategoryRequest,
  CreateProfileRequest,
  CreateSubscriptionRequest,
  CreateTransactionRequest,
  Insight,
  InsightRequest,
  InterpretRequest,
  InterpretResponse,
  LoginRequest,
  MerchantBackfillRequest,
  MerchantBackfillResponse,
  MerchantSuggestion,
  NarrationResponse,
  Page,
  Plan,
  ProfileResponse,
  RegisterRequest,
  RestoreBackupResponse,
  ResultEnvelope,
  SessionResponse,
  SubscriptionDashboardResponse,
  SubscriptionResponse,
  SubscriptionStatus,
  TransactionQuery,
  TransactionResponse,
  TransactionSummaryRow,
  UpdateCategoryRequest,
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

/** PATCH /api/categories/{id} — absent fields stay untouched; `color: null` clears. */
export function useUpdateCategory() {
  const queryClient = useQueryClient();
  const profileId = useActiveProfileId();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateCategoryRequest }) =>
      api<CategoryNode>(`/api/categories/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      // Colors resolve client-side from the categories tree, which every screen
      // (dashboard included) reads — invalidating it repaints them all.
      queryClient.invalidateQueries({ queryKey: ['categories', profileId] });
      queryClient.invalidateQueries({ queryKey: ['subscription-dashboard', profileId] });
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
        })}`,
      ),
    enabled: profileId !== null,
    placeholderData: (previous) => previous,
  });
}

/** GET /api/transactions/category-counts — every transaction of the profile, counted as filed. */
export function useCategoryCounts() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['category-counts', profileId],
    queryFn: () => api<CategoryTransactionCount[]>('/api/transactions/category-counts'),
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
      api<MerchantBackfillResponse>('/api/transactions/merchant-backfill', { method: 'POST', body }),
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

// — Backup —

/**
 * POST /api/backup/export — resolves to the backup file as a Blob plus the
 * server-chosen filename; the caller triggers the browser download.
 */
export function useExportBackup() {
  return useMutation({
    mutationFn: (profileIds: number[]) => {
      const body: BackupExportRequest = { profileIds };
      return apiDownload('/api/backup/export', body);
    },
  });
}

/** POST /api/backup/restore — restore always creates NEW profiles. */
export function useRestoreBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiUpload<RestoreBackupResponse>('/api/backup/restore', form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      // The picker renders session.profiles — refetch so the restored
      // profiles show up as cards immediately (mirrors useCreateProfile).
      queryClient.invalidateQueries({ queryKey: sessionKey });
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
 */
export function useNarrate() {
  return useMutation({
    mutationFn: (plan: Plan) =>
      api<NarrationResponse>('/api/insights/narrate', { method: 'POST', body: plan }),
  });
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

/** POST /api/insights/interpret — the AI search box's only call. Nothing cached changes. */
export function useInterpret() {
  return useMutation({
    mutationFn: (body: InterpretRequest) =>
      api<InterpretResponse>('/api/insights/interpret', { method: 'POST', body }),
  });
}
