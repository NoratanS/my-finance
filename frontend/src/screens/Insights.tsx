import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useActiveProfile, useCategories, useExecutePlan } from '../api/hooks';
import type { Plan, ResultEnvelope } from '../api/types';
import { Card } from '../components/Card';
import { ChipBar } from '../insights/chips/ChipBar';
import { describePlan, planFromSearch, planToSearch } from '../insights/planDefaults';
import { ResultTable } from '../insights/renderers/ResultTable';
import { flattenTree } from '../lib/categoryColor';

/**
 * Plan-problem prefixes mapped to the chip that can fix them. Only the
 * documented common case is wired up (docs/INSIGHTS.md's example problem is a
 * stale categoryId) — other problems still show, just without an Edit button.
 */
function chipIdForProblem(problem: string): string | undefined {
  return problem.startsWith('filters.categoryId') ? 'chip-category' : undefined;
}

export function Insights() {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
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

  if (!profile) return null;
  const plan = planFromSearch(searchParams.get('plan'), profile.defaultCurrency);
  const byId = flattenTree(categories ?? []);
  const categoryName =
    plan.filters.categoryId !== undefined ? byId.get(plan.filters.categoryId)?.name : undefined;

  /**
   * The explorer's one mutator for `plan`. Not `useState`: the plan lives in
   * the URL (`?plan=`) so an exploration is linkable and survives a refresh —
   * chips and the Stage 3 search box both call this by name. There is no
   * functional-update form: callers must always pass a complete `Plan`.
   */
  const setPlan = (next: Plan) => {
    const params = new URLSearchParams(searchParams);
    params.set('plan', planToSearch(next));
    setSearchParams(params, { replace: true });
  };

  const error = execute.error;
  const apiError = error instanceof ApiError ? error : undefined;
  const problems =
    apiError && Array.isArray(apiError.extra.problems)
      ? (apiError.extra.problems as string[])
      : undefined;

  return (
    <main>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          margin: '26px 0 18px',
        }}
      >
        <h2 style={{ margin: 0 }}>Insights</h2>
        <span className="text-muted" style={{ fontSize: 13 }}>
          one question at a time · {profile.name}
        </span>
      </div>
      <Card style={{ padding: '18px 20px' }}>
        <div className="kicker" style={{ marginBottom: 10 }}>
          Plan
        </div>
        <ChipBar
          plan={plan}
          categories={categories ?? []}
          defaultCurrency={profile.defaultCurrency}
          onChange={setPlan}
        />
        <div className="text-muted" style={{ fontSize: 12, margin: '10px 0 14px' }}>
          {describePlan(plan, categoryName)}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            // Canonicalizes the URL to exactly what gets executed, so the
            // resulting view is linkable and a refresh reruns the same plan.
            setPlan(plan);
            execute.mutate(plan, {
              onSuccess: (data) => setLastEnvelope(data),
              onError: () => setLastEnvelope(undefined),
            });
          }}
          disabled={execute.isPending}
        >
          {execute.isPending ? 'Running…' : 'Run'}
        </button>
        {error && (
          <div className="error-box" role="alert" style={{ marginTop: 12 }}>
            {apiError?.type === '/errors/analytics-unavailable' ? (
              // Operational state, not a bug (docs/API.md "Status code summary") — everything
              // else in the app keeps working, so the copy stays calm, not alarming.
              "Analytics is offline right now — the analytics service isn't running. " +
              "Everything else in the app still works; try Run again once it's back up."
            ) : problems && apiError ? (
              <>
                {apiError.detail}
                <ul className="ins-problems">
                  {problems.map((problem, index) => {
                    const chipId = chipIdForProblem(problem);
                    return (
                      <li key={index}>
                        {problem}
                        {chipId && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ marginLeft: 8, padding: '1px 10px', fontSize: 12 }}
                            onClick={() => document.getElementById(chipId)?.focus()}
                          >
                            Edit
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : apiError ? (
              `${apiError.status} ${apiError.type.replace('/errors/', '')} — ${apiError.detail}`
            ) : (
              'Could not run the plan — is the backend running?'
            )}
          </div>
        )}
      </Card>
      {!error && lastEnvelope && (
        <div aria-busy={execute.isPending}>
          {lastEnvelope.results.length === 0 ? (
            <Card style={{ padding: '18px 20px', marginTop: 24 }}>
              <p className="text-muted" style={{ margin: 0 }}>
                No matching activity for this plan — try a wider range or fewer filters.
              </p>
            </Card>
          ) : (
            lastEnvelope.results.map((result) => (
              <Card key={result.currency} style={{ padding: '18px 20px', marginTop: 24 }}>
                <div className="kicker">{result.currency}</div>
                <ResultTable result={result} />
              </Card>
            ))
          )}
        </div>
      )}
    </main>
  );
}
