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
import type {
  CurrencyResult,
  Insight as SavedInsight,
  Plan,
  ResultEnvelope,
} from '../api/types';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TrashIcon } from '../components/icons';
import { AiSearchBox } from '../insights/AiSearchBox';
import { Caption } from '../insights/Caption';
import { ChipBar } from '../insights/chips/ChipBar';
import { FollowUp } from '../insights/FollowUp';
import { describePlan, planFromSearch, planToSearch } from '../insights/planDefaults';
import { ResultRenderer } from '../insights/renderers/ResultRenderer';
import { seriesColors } from '../insights/renderers/chartTheme';
import { TEMPLATES } from '../insights/templates';
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
      <div
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
            <div
              aria-busy={execute.isPending}
              style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
            >
              {lastEnvelope.results.length === 0 && (
                <Card style={{ padding: 40, textAlign: 'center' }}>
                  <p className="text-muted" style={{ margin: 0 }}>
                    No transactions match this plan — an empty answer is still an answer. Widen
                    the range or clear the category chip.
                  </p>
                </Card>
              )}
              {lastEnvelope.results.map((result) => (
                <Card key={result.currency} style={{ padding: '18px 20px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12,
                    }}
                  >
                    <div className="kicker">{result.currency}</div>
                    <span className="seg">
                      {(['chart', 'table'] as const).map((mode) => (
                        <button
                          key={mode}
                          className={`seg-btn${view === mode ? ' active' : ''}`}
                          aria-pressed={view === mode}
                          onClick={() => setView(mode)}
                        >
                          {mode}
                        </button>
                      ))}
                    </span>
                  </div>
                  {/* Both read the EXECUTED plan, not the chip bar's live one. A chip
                      edit does not clear lastEnvelope, so the chart keeps showing the
                      last Run — and a caption or a colour scheme taken from `plan`
                      would describe something the reader cannot see. FollowUp is the
                      opposite case and correctly uses the live plan. */}
                  <ResultRenderer
                    result={result}
                    colorFor={seriesColors(byId, lastEnvelope.plan.groupBy)}
                    view={view}
                  />
                  <Caption plan={lastEnvelope.plan} />
                  {isAllZero(result) && (
                    <p className="text-muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
                      Every bucket in this range is zero.
                    </p>
                  )}
                </Card>
              ))}
              {lastEnvelope.meta.truncatedGroups && (
                <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                  Only the top 25 groups are charted; the rest are aggregated as “Other”.
                </p>
              )}
            </div>
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

/** Execute failures the explorer has something specific to say about. */
function ExecutionError({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) {
    return (
      <div className="error-box" role="alert" style={{ marginTop: 12 }}>
        Could not run the plan — is the backend running?
      </div>
    );
  }

  if (error.type === '/errors/analytics-unavailable') {
    return (
      // Operational state, not a bug (docs/API.md "Status code summary") — everything else in
      // the app keeps working, so the copy stays calm, not alarming. Wording carries the exact
      // substring docs/API.md:1145 pins ("the analytics service isn't running"), lowercase and
      // mid-sentence — the brief's sample sentence capitalizes it at the start and loses that.
      <div className="error-box" role="alert" style={{ marginTop: 12 }}>
        Analytics is offline right now — the analytics service isn't running. Everything else in
        the app still works; try Run again once it's back up.
      </div>
    );
  }

  const problems = Array.isArray(error.extra.problems) ? (error.extra.problems as string[]) : [];
  if (problems.length > 0) {
    return (
      <div className="error-box" role="alert" style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 6 }}>
          The analytics service rejected this plan — edit a chip and run again:
        </div>
        <ul className="ins-problems">
          {problems.map((problem) => {
            const chipId = chipIdForProblem(problem);
            return (
              <li key={problem}>
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
      </div>
    );
  }

  return (
    <div className="error-box" role="alert" style={{ marginTop: 12 }}>
      {error.status} {error.type.replace('/errors/', '')} — {error.detail}
    </div>
  );
}

/**
 * A zero-filled chart is a correct answer, not an empty state — but saying so
 * beats letting the user wonder whether the chart failed to load. Having
 * *nothing* in the range is a different answer, so each collection has to hold
 * something before it can be all zero: `[].every()` is `true`.
 */
function isAllZero(result: CurrencyResult): boolean {
  switch (result.shape) {
    case 'value':
      return parseFloat(result.value) === 0;
    case 'timeseries':
      return (
        result.points.length > 0 && result.points.every((point) => parseFloat(point.value) === 0)
      );
    case 'breakdown':
      return (
        result.groups.length > 0 && result.groups.every((group) => parseFloat(group.value) === 0)
      );
    case 'timeseriesSplit':
      return (
        result.series.length > 0 &&
        result.series.every((series) =>
          series.points.every((point) => parseFloat(point.value) === 0),
        )
      );
  }
}
