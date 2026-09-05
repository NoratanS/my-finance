import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useActiveProfile, useCategories, useExecutePlan } from '../api/hooks';
import type { Plan } from '../api/types';
import { Card } from '../components/Card';
import { ChipBar } from '../insights/chips/ChipBar';
import { describePlan, planFromSearch, planToSearch } from '../insights/planDefaults';
import { ResultTable } from '../insights/renderers/ResultTable';
import { flattenTree } from '../lib/categoryColor';

export function Insights() {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const [searchParams, setSearchParams] = useSearchParams();
  const execute = useExecutePlan();

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

  const envelope = execute.data;
  const error = execute.error;

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
            execute.mutate(plan);
          }}
          disabled={execute.isPending}
        >
          {execute.isPending ? 'Running…' : 'Run'}
        </button>
        {error && (
          <div className="error-box" style={{ marginTop: 12 }}>
            {error instanceof ApiError
              ? `${error.status} ${error.type.replace('/errors/', '')} — ${error.detail}`
              : 'Could not run the plan — is the backend running?'}
          </div>
        )}
      </Card>
      {envelope?.results.map((result) => (
        <Card key={result.currency} style={{ padding: '18px 20px', marginTop: 24 }}>
          <div className="kicker">{result.currency}</div>
          <ResultTable result={result} />
        </Card>
      ))}
    </main>
  );
}
