import { useMutation, useQuery, useQueryClient, useQueries } from '@tanstack/react-query';
import { api } from '../client';
import { useActiveProfileId } from './auth';
import type { Insight, InsightRequest, Plan, ResultEnvelope } from '../types';

// — Insights —

/**
 * A saved plan as the backend stores it: verbatim, so a hand-crafted one may
 * leave out `filters`, `groupBy` or `interval` (docs/INSIGHTS.md → "Plan DSL v1").
 */
type SavedPlan = Omit<Plan, 'filters' | 'groupBy' | 'interval'> &
  Partial<Pick<Plan, 'filters' | 'groupBy' | 'interval'>>;
type SavedInsight = Omit<Insight, 'plan'> & { plan: SavedPlan };

/**
 * The one place saved plans enter the frontend, so the one place they become
 * a Normalized plan — read exactly as the executor reads them: an absent
 * `filters` is `{}`, an absent `groupBy` or `interval` is `null`. Nothing else
 * is added, removed or validated; the executor stays the one validator.
 */
function normalized(insight: SavedInsight): Insight {
  const { plan } = insight;
  return {
    ...insight,
    plan: {
      ...plan,
      filters: plan.filters ?? {},
      groupBy: plan.groupBy ?? null,
      interval: plan.interval ?? null,
    },
  };
}

export function useInsights() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['insights', profileId],
    queryFn: async () => (await api<SavedInsight[]>('/api/insights')).map(normalized),
    enabled: profileId !== null,
  });
}

/** One saved insight — the explorer's ?insight=<id> deep link. */
export function useInsight(id: number) {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: ['insight', profileId, id],
    queryFn: async () => normalized(await api<SavedInsight>(`/api/insights/${id}`)),
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
    mutationFn: (body: InsightRequest) => api<Insight>('/api/insights', { method: 'POST', body }),
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
