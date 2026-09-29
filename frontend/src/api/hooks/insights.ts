import { useMutation, useQuery, useQueryClient, useQueries } from '@tanstack/react-query';
import { api } from '../client';
import { useActiveProfileId } from './auth';
import type { Insight, InsightRequest, Plan, ResultEnvelope } from '../types';

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
