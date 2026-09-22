import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useExecutePlan, useInsight } from '../api/hooks';
import type { Plan, ResultEnvelope } from '../api/types';
import { planFromSearch, planToSearch } from './planDefaults';

/**
 * The explorer's plan state: what's in the URL (the live, draft plan and
 * which saved insight — if any — is open), the chart/table toggle and its
 * one-time seeding from a saved insight's `viz`, and the last successfully
 * executed envelope. `run` is the Run button's own handler: it canonicalizes
 * the URL to exactly what it executes, so the resulting view stays linkable.
 *
 * Called unconditionally at the top of `Insights()`, before its `!profile`
 * guard — `useActiveProfile` can still be loading on an early render, so
 * `currency` may be `undefined` here. The `?? ''` fallback below is never
 * actually read: the caller's guard bails out before rendering anything that
 * reads `plan` while `currency` is undefined.
 */
export function usePlanState(currency: string | undefined) {
  const [searchParams, setSearchParams] = useSearchParams();
  const execute = useExecutePlan();
  /**
   * The screen's own snapshot of the last successful run. TanStack builds a
   * fresh Mutation on every mutate() call, whose "pending" state resets both
   * data and error to empty (@tanstack/query-core Mutation#dispatch) — so
   * execute.data alone would blank the results on every re-run instead of
   * staying on screen while loading, as the design requires. Cleared on error
   * too: a failed re-run must not resurrect an older, now-unrelated result
   * next to the new error box (Task 32's carried review point).
   */
  const [lastEnvelope, setLastEnvelope] = useState<ResultEnvelope>();
  const [view, setView] = useState<'chart' | 'table'>('chart');

  // ?insight=<id> opens a saved insight; editing a chip then writes ?plan=,
  // which takes precedence so an edit is never lost on a re-render.
  const rawId = Number(searchParams.get('insight') ?? '0');
  const openId = Number.isInteger(rawId) && rawId > 0 ? rawId : 0;
  const saved = useInsight(openId);

  /**
   * A saved insight's `viz` seeds the chart/table toggle, once per insight
   * opened. State adjusted during render (React's "adjusting state when a prop
   * changes"), not in an effect: the `vizSeededFor` guard means this fires only
   * when a *different* insight's data arrives, so no later re-render — the
   * refetch after "Save changes" included — can overwrite the view the user
   * just toggled to. It also covers the dashboard's `?insight=7` deep link,
   * which never goes through `openSaved`.
   */
  const [vizSeededFor, setVizSeededFor] = useState(0);
  if (saved.data && saved.data.id !== vizSeededFor) {
    setVizSeededFor(saved.data.id);
    setView(saved.data.viz?.chart === 'table' ? 'table' : 'chart');
  } else if (!saved.data && vizSeededFor !== 0) {
    // Closed (New insight / a template): re-arm, so reopening it re-seeds.
    setVizSeededFor(0);
  }

  const planParam = searchParams.get('plan');
  // ?plan= (an in-progress edit) wins over the saved insight's own plan, so a
  // chip edit is never lost on a re-render; a bare ?insight= deep link (no
  // ?plan= yet) still renders the saved plan instead of the blank default.
  const plan = planParam
    ? planFromSearch(planParam, currency ?? '')
    : (saved.data?.plan ?? planFromSearch(null, currency ?? ''));

  /**
   * The explorer's one mutator for `plan`. Not `useState`: the plan lives in
   * the URL (`?plan=`) so an exploration is linkable and survives a refresh —
   * chips and templates both call this by name. There is no
   * functional-update form: callers must always pass a complete `Plan`.
   */
  const setPlan = (next: Plan) => {
    const params = new URLSearchParams(searchParams);
    params.set('plan', planToSearch(next));
    setSearchParams(params, { replace: true });
  };

  const run = () => {
    // Canonicalizes the URL to exactly what gets executed, so the resulting
    // view is linkable and a refresh reruns the same plan.
    setPlan(plan);
    execute.mutate(plan, {
      onSuccess: (data) => setLastEnvelope(data),
      onError: () => setLastEnvelope(undefined),
    });
  };

  return {
    setSearchParams,
    plan,
    setPlan,
    openId,
    saved,
    view,
    setView,
    lastEnvelope,
    execute,
    run,
  };
}
