import { useState } from 'react';
import { ApiError } from '../api/client';
import { useActiveProfile, useCategories } from '../api/hooks';
import type { Plan } from '../api/types';
import { Card } from '../components/Card';
import { ChipBar } from '../insights/chips/ChipBar';
import { describePlan, planToSearch } from '../insights/planDefaults';
import { ExecutionError, ResultsPanel } from '../insights/ResultsPanel';
import { SaveControls } from '../insights/SaveControls';
import { TEMPLATES } from '../insights/templates';
import { usePlanState } from '../insights/usePlanState';
import { flattenTree } from '../lib/categoryColor';

export function Insights() {
  const profile = useActiveProfile();
  const { data: categories } = useCategories();
  const {
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
  } = usePlanState(profile?.defaultCurrency);
  // null = "follow the open insight's name"; a string = the user is typing.
  // Controlled here (not inside SaveControls) because the template picker
  // below also needs to reset a name draft when it swaps in a fresh plan.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');

  if (!profile) return null;
  const currency = profile.defaultCurrency;
  const byId = flattenTree(categories ?? []);
  const categoryName =
    plan.filters.categoryId !== undefined ? byId.get(plan.filters.categoryId)?.name : undefined;

  /** Templates land in the chips, unrun: the point is to see what changed. */
  const openTemplate = (plan: Plan) => {
    setNameDraft(null);
    setSaveError('');
    setSearchParams({ plan: planToSearch(plan) });
  };

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
      {openId > 0 && saved.isError && (
        // A stale bookmark/dashboard tile after the insight was deleted (J10) must not
        // quietly fall back to the default plan below — the fallback still renders (it's
        // the least-broken thing to show), but only after saying why.
        <div className="error-box" role="alert" style={{ marginBottom: 18 }}>
          {savedInsightErrorMessage(saved.error)}
        </div>
      )}
      <div
        className="card-grid"
        style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 24, alignItems: 'start' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card style={{ padding: '18px 20px' }}>
            <div className="kicker" style={{ marginBottom: 10 }}>
              Plan
            </div>
            <ChipBar
              plan={plan}
              categories={categories ?? []}
              defaultCurrency={currency}
              onChange={setPlan}
            />
            <div className="text-muted" style={{ fontSize: 12, margin: '10px 0 14px' }}>
              {describePlan(plan, categoryName)}
            </div>
            <button className="btn btn-primary" onClick={run} disabled={execute.isPending}>
              {execute.isPending ? 'Running…' : 'Run'}
            </button>
            {error && <ExecutionError error={error} />}
          </Card>
          {!error && lastEnvelope && (
            <ResultsPanel
              lastEnvelope={lastEnvelope}
              pending={execute.isPending}
              view={view}
              setView={setView}
              byId={byId}
            />
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <SaveControls
            saved={saved}
            plan={plan}
            view={view}
            openId={openId}
            setSearchParams={setSearchParams}
            nameDraft={nameDraft}
            setNameDraft={setNameDraft}
            saveError={saveError}
            setSaveError={setSaveError}
          />

          <Card style={{ padding: '18px 20px' }}>
            <h4 style={{ margin: '0 0 4px' }}>Start from a template</h4>
            <p className="text-muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
              Each one fills the chips — tweak, run, save.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  className="ins-template"
                  onClick={() => openTemplate(template.plan(currency))}
                >
                  <span style={{ fontSize: 13 }}>{template.name}</span>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {template.blurb}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

/** A deep link's saved-insight fetch failed — 404 means it was deleted, anything else is
 * transient. Distinguishing the two matters: calling a network blip "no longer exists" would
 * be the same kind of dishonest state this task exists to remove. */
function savedInsightErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'This saved insight no longer exists — it may have been deleted.';
  }
  return "Couldn't load this saved insight — try again, or start a new one from the chips below.";
}
