import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  useActiveProfile,
  useAiCapabilities,
  useCategories,
  useCreateInsight,
  useDeleteInsight,
  useExecutePlan,
  useInsight,
  useInsights,
  useUpdateInsight,
} from '../api/hooks';
import type { Insight as SavedInsight, Plan, ResultEnvelope } from '../api/types';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TrashIcon } from '../components/icons';
import { AiSearchBox } from '../insights/AiSearchBox';
import { ChipBar } from '../insights/chips/ChipBar';
import { FollowUp } from '../insights/FollowUp';
import { describePlan, planFromSearch, planToSearch } from '../insights/planDefaults';
import { ExecutionError, ResultsPanel } from '../insights/ResultsPanel';
import { TEMPLATES } from '../insights/templates';
import { flattenTree } from '../lib/categoryColor';

export function Insights() {
  const profile = useActiveProfile();
  const { data: capabilities } = useAiCapabilities();
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
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const insights = useInsights();
  const createInsight = useCreateInsight();
  const updateInsight = useUpdateInsight();
  const deleteInsight = useDeleteInsight();
  // null = "follow the open insight's name"; a string = the user is typing.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  // The saved insight awaiting delete confirmation, or null when no dialog is open.
  const [confirmInsight, setConfirmInsight] = useState<SavedInsight | null>(null);

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

  if (!profile) return null;
  const currency = profile.defaultCurrency;
  const planParam = searchParams.get('plan');
  // ?plan= (an in-progress edit) wins over the saved insight's own plan, so a
  // chip edit is never lost on a re-render; a bare ?insight= deep link (no
  // ?plan= yet) still renders the saved plan instead of the blank default.
  const plan = planParam
    ? planFromSearch(planParam, currency)
    : (saved.data?.plan ?? planFromSearch(null, currency));
  const byId = flattenTree(categories ?? []);
  const categoryName =
    plan.filters.categoryId !== undefined ? byId.get(plan.filters.categoryId)?.name : undefined;
  const name = nameDraft ?? saved.data?.name ?? '';
  const list = insights.data ?? [];

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

  const onSaveError = (err: unknown) => {
    setSaveError(
      err instanceof ApiError
        ? `${err.status} ${err.type.replace('/errors/', '')} — ${err.detail}`
        : 'Could not save the insight.',
    );
  };

  const openSaved = (insight: SavedInsight) => {
    setNameDraft(null);
    setSaveError('');
    // Both params: until useInsight resolves, ?plan= keeps the chips on this
    // insight's plan instead of flashing back to the default one.
    setSearchParams({ insight: String(insight.id), plan: planToSearch(insight.plan) });
  };

  /** Templates land in the chips, unrun: the point is to see what changed. */
  const openTemplate = (plan: Plan) => {
    setNameDraft(null);
    setSaveError('');
    setSearchParams({ plan: planToSearch(plan) });
  };

  const startNew = () => {
    setNameDraft(null);
    setSaveError('');
    setSearchParams({});
  };

  /** Save creates, or replaces the open insight (which is also the rename). */
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setSaveError('Give the insight a name first.');
      return;
    }
    setSaveError('');
    // The toggle is part of the saved question: `null` means "the default
    // chart for this shape", which is what SCHEMA.md's `viz` column documents.
    const viz = view === 'table' ? { chart: 'table' as const } : null;
    if (saved.data) {
      updateInsight.mutate(
        { id: saved.data.id, body: { name: trimmed, plan, viz, pinned: saved.data.pinned } },
        { onSuccess: () => setNameDraft(null), onError: onSaveError },
      );
    } else {
      createInsight.mutate(
        { name: trimmed, plan, viz },
        {
          onSuccess: (created) => {
            setNameDraft(null);
            setSearchParams(
              { insight: String(created.id), plan: planToSearch(plan) },
              { replace: true },
            );
          },
          onError: onSaveError,
        },
      );
    }
  };

  const togglePin = (insight: SavedInsight) => {
    setSaveError('');
    updateInsight.mutate(
      {
        id: insight.id,
        body: {
          name: insight.name,
          plan: insight.plan,
          viz: insight.viz,
          pinned: !insight.pinned,
        },
      },
      { onError: onSaveError },
    );
  };

  const remove = (insight: SavedInsight) => {
    setSaveError('');
    deleteInsight.mutate(insight.id, {
      onSuccess: () => {
        if (openId === insight.id) setSearchParams({});
      },
      onError: onSaveError,
    });
  };

  const error = execute.error;
  const busy = createInsight.isPending || updateInsight.isPending;
  const nameHasError = saveError !== '';

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
        {/* Title and badge are one flex child so space-between still sees two, the
            shape every other screen header uses. */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Insights</h2>
          {capabilities?.interpret && (
            <span className="tag tag-accent">AI · {capabilities.model}</span>
          )}
        </div>
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
          <AiSearchBox onDraft={setPlan} />
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
            <FollowUp currentPlan={plan} onPlan={setPlan} />
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
          <Card style={{ padding: '18px 20px' }}>
            <h4 style={{ margin: '0 0 12px' }}>
              {saved.data ? 'Saved insight' : 'Save this insight'}
            </h4>
            <div className="field">
              <label htmlFor="insight-name">Name</label>
              <input
                id="insight-name"
                className="input"
                value={name}
                onChange={(e) => {
                  setNameDraft(e.target.value);
                  setSaveError('');
                }}
                placeholder="e.g. Groceries, monthly"
                aria-label="Insight name"
                aria-describedby={nameHasError ? 'insight-name-error' : undefined}
                aria-invalid={nameHasError || undefined}
              />
            </div>
            {saveError && (
              <div id="insight-name-error" className="error-box" role="alert" style={{ marginTop: 10 }}>
                {saveError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                {saved.data ? 'Save changes' : 'Save'}
              </button>
              {saved.data && (
                <button className="btn btn-secondary" onClick={startNew}>
                  New insight
                </button>
              )}
            </div>
          </Card>

          <Card style={{ padding: '18px 20px' }}>
            <h4 style={{ margin: '0 0 12px' }}>Saved</h4>
            {list.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {list.map((insight) => (
                  <div
                    key={insight.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                  >
                    <button
                      className="btn btn-ghost"
                      style={{ padding: 0, flex: 1, justifyContent: 'flex-start' }}
                      onClick={() => openSaved(insight)}
                    >
                      {insight.name}
                    </button>
                    {insight.pinned && <span className="tag tag-accent-2">pinned</span>}
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '2px 8px' }}
                      onClick={() => togglePin(insight)}
                      disabled={updateInsight.isPending}
                      aria-label={`${insight.pinned ? 'Unpin' : 'Pin'} ${insight.name}`}
                    >
                      {insight.pinned ? 'unpin' : 'pin'}
                    </button>
                    <button
                      className="btn btn-icon btn-ghost"
                      onClick={() => setConfirmInsight(insight)}
                      disabled={deleteInsight.isPending}
                      title="Delete permanently"
                      aria-label={`Delete ${insight.name}`}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                Nothing saved yet. Build a plan with the chips, run it, then give it a name.
              </p>
            )}
          </Card>

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
      {confirmInsight && (
        <ConfirmDialog
          title={`Delete the saved insight "${confirmInsight.name}"?`}
          body="This can't be undone."
          confirmLabel="Delete"
          onClose={() => setConfirmInsight(null)}
          onConfirm={() => {
            remove(confirmInsight);
            setConfirmInsight(null);
          }}
        />
      )}
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

